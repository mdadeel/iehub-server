import express from 'express';
import mongoose from 'mongoose';
import RFQ from '../models/RFQ.js';
import Product from '../models/Product.js';
import Import from '../models/Import.js';
import AuditLog from '../models/AuditLog.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/rfq — List RFQs for authenticated buyer or seller
router.get('/', verifyAuth, handleAsyncError(async (req, res) => {
    const email = req.user.email;
    const rfqs = await RFQ.find({
        $or: [{ buyerEmail: email }, { exporterEmail: email }]
    }).sort({ updatedAt: -1 });

    res.json(rfqs);
}));

// POST /api/rfq — Submit new RFQ
router.post('/', verifyAuth, handleAsyncError(async (req, res) => {
    const { productId, notes, incoterm } = req.body;
    const targetQuantity = req.body.targetQuantity || req.body.requestedQuantity;
    const targetPrice = req.body.targetPrice;
    const destinationPort = req.body.destinationPort || req.body.targetPort || '';

    if (!productId || !targetQuantity || !targetPrice) {
        throw new ApiError('Missing required fields: productId, targetQuantity (or requestedQuantity), targetPrice', 400);
    }

    const product = await Product.findById(productId);
    if (!product) throw new ApiError('Product not found', 404);

    const rfqNumber = `RFQ-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const rfq = new RFQ({
        rfqNumber,
        productId,
        productName: product.name,
        buyerEmail: req.user.email,
        buyerName: req.user.displayName || req.user.email,
        exporterEmail: product.exporterEmail || 'desk@importexport.com',
        targetQuantity: Number(targetQuantity),
        targetPrice: Number(targetPrice),
        unit: product.unit || 'Metric Tons (MT)',
        incoterm: incoterm || product.incoterm || 'FOB',
        destinationPort: destinationPort || '',
        notes: notes || '',
        status: 'Submitted',
    });

    await rfq.save();

    AuditLog.create({
        actorEmail: req.user.email,
        action: 'RFQ_SUBMITTED',
        targetEntity: 'RFQ',
        targetId: String(rfq._id),
        details: { rfqNumber, targetPrice, targetQuantity, productName: product.name },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(201).json(rfq);
}));

// PATCH /api/rfq/:id/counter — Counter-offer
router.patch('/:id/counter', verifyAuth, handleAsyncError(async (req, res) => {
    const { counterPrice, counterQuantity, notes } = req.body;
    const rfq = await RFQ.findById(req.params.id);
    if (!rfq) throw new ApiError('RFQ not found', 404);

    const isParty = rfq.buyerEmail === req.user.email || rfq.exporterEmail === req.user.email;
    if (!isParty && !req.user.isAdmin) {
        throw new ApiError('Not authorized to counter this RFQ', 403);
    }

    rfq.counterOffers.push({
        byEmail: req.user.email,
        counterPrice: Number(counterPrice) || rfq.targetPrice,
        counterQuantity: Number(counterQuantity) || rfq.targetQuantity,
        notes: notes || '',
    });

    rfq.status = 'Countered';
    if (counterPrice) rfq.targetPrice = Number(counterPrice);
    if (counterQuantity) rfq.targetQuantity = Number(counterQuantity);

    await rfq.save();
    res.json(rfq);
}));

// PATCH /api/rfq/:id/accept — Accept RFQ
router.patch('/:id/accept', verifyAuth, handleAsyncError(async (req, res) => {
    const rfq = await RFQ.findById(req.params.id);
    if (!rfq) throw new ApiError('RFQ not found', 404);

    const isParty = rfq.buyerEmail === req.user.email || rfq.exporterEmail === req.user.email;
    if (!isParty && !req.user.isAdmin) {
        throw new ApiError('Not authorized to accept this RFQ', 403);
    }

    rfq.status = 'Accepted';
    await rfq.save();

    AuditLog.create({
        actorEmail: req.user.email,
        action: 'RFQ_ACCEPTED',
        targetEntity: 'RFQ',
        targetId: String(rfq._id),
        details: { rfqNumber: rfq.rfqNumber, targetPrice: rfq.targetPrice },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(rfq);
}));

// POST /api/rfq/:id/convert or /:id/convert-to-po — Convert accepted RFQ into binding Purchase Order
const handleConvertRFQ = handleAsyncError(async (req, res) => {
    const rfq = await RFQ.findById(req.params.id);
    if (!rfq) throw new ApiError('RFQ not found', 404);
    if (rfq.buyerEmail !== req.user.email && !req.user.isAdmin) {
        throw new ApiError('Only the buyer can execute a PO conversion', 403);
    }
    const allowed = ['Accepted', 'Quoted', 'Countered', 'Submitted'];
    if (!allowed.includes(rfq.status)) {
        throw new ApiError('This RFQ cannot be converted to a Purchase Order in its current state', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const product = await Product.findOneAndUpdate(
            { _id: rfq.productId, quantity: { $gte: rfq.targetQuantity } },
            { $inc: { quantity: -rfq.targetQuantity } },
            { new: true, session }
        );

        if (!product) {
            await session.abortTransaction();
            throw new ApiError('Insufficient inventory to fulfill negotiated RFQ quantity', 400);
        }

        const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        const totalAmount = rfq.targetPrice * rfq.targetQuantity;

        const newImport = new Import({
            userId: req.user.uid,
            userEmail: req.user.email,
            productId: rfq.productId,
            quantity: rfq.targetQuantity,
            poNumber,
            unitPrice: rfq.targetPrice,
            totalAmount,
            incoterm: rfq.incoterm,
            unit: rfq.unit,
            status: 'Confirmed',
            sellerAccepted: 'Accepted', // Auto-accepted since both sides agreed on RFQ
            destinationPort: rfq.destinationPort || 'Designated Port of Entry',
            paymentTerms: rfq.paymentTerms,
            contractNotes: `Generated from accepted RFQ: ${rfq.rfqNumber}. ${rfq.notes}`,
        });

        await newImport.save({ session });

        rfq.status = 'ConvertedToPO';
        await rfq.save({ session });

        await session.commitTransaction();

        AuditLog.create({
            actorEmail: req.user.email,
            action: 'RFQ_CONVERTED_TO_PO',
            targetEntity: 'Import',
            targetId: String(newImport._id),
            details: { rfqNumber: rfq.rfqNumber, poNumber },
            ipAddress: req.ip || '',
        }).catch(err => console.error('Audit log failed:', err));

        res.status(201).json(newImport);
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});

router.post('/:id/convert', verifyAuth, handleConvertRFQ);
router.post('/:id/convert-to-po', verifyAuth, handleConvertRFQ);

export default router;
