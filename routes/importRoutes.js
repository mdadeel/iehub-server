import express from 'express';
import mongoose from 'mongoose';
import Import from '../models/Import.js';
import Product from '../models/Product.js';
import AuditLog from '../models/AuditLog.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET imports by user email — Authenticated (Self or Admin)
router.get('/:email', verifyAuth, handleAsyncError(async (req, res) => {
    // IDOR check: Users can only query their own purchase orders unless Admin
    if (req.user.email !== req.params.email.toLowerCase() && !req.user.isAdmin) {
        throw new ApiError('Not authorized to access purchase orders for this entity', 403);
    }

    const imports = await Import.find({ userEmail: req.params.email }).populate('productId');
    res.json(imports);
}));

// POST create import / issue Purchase Order — Authenticated + Transaction Wrapped
router.post('/', verifyAuth, handleAsyncError(async (req, res) => {
    const { productId, quantity, destinationPort, paymentTerms, laycanWindow, contractNotes, incoterm: reqIncoterm } = req.body;
    
    // Bind identity strictly from authenticated token
    const userId = req.user.uid;
    const userEmail = req.user.email;

    if (!productId || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
        throw new ApiError('Invalid productId or quantity (must be a positive integer)', 400);
    }

    // Wrap inventory decrement and PO creation in atomic Mongoose transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const updatedProduct = await Product.findOneAndUpdate(
            { _id: productId, quantity: { $gte: quantity } },
            { $inc: { quantity: -quantity } },
            { new: true, session }
        );

        if (!updatedProduct) {
            const productExists = await Product.findById(productId).session(session);
            if (!productExists) {
                await session.abortTransaction();
                return res.status(404).json({ message: 'Product not found' });
            }
            await session.abortTransaction();
            return res.status(400).json({ message: 'Insufficient stock available for this order volume' });
        }

        const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        const unitPrice = updatedProduct.price || 0;
        const totalAmount = unitPrice * quantity;
        const incoterm = reqIncoterm || updatedProduct.incoterm || 'FOB';
        const unit = updatedProduct.unit || 'Metric Tons (MT)';

        const newImport = new Import({
            userId,
            userEmail,
            productId,
            quantity,
            poNumber,
            unitPrice,
            totalAmount,
            incoterm,
            unit,
            status: 'Confirmed',
            destinationPort: destinationPort || 'Designated Port of Entry',
            paymentTerms: paymentTerms || 'Confirmed Letter of Credit (LC)',
            laycanWindow: laycanWindow || 'Standard 14-Day Laycan Window',
            contractNotes: contractNotes || ''
        });

        await newImport.save({ session });
        await session.commitTransaction();

        // Audit log PO creation
        AuditLog.create({
            actorEmail: userEmail,
            action: 'PO_ISSUED',
            targetEntity: 'Import',
            targetId: String(newImport._id),
            details: { poNumber, totalAmount, productId, quantity },
            ipAddress: req.ip || '',
        }).catch(err => console.error('Audit log failed:', err));

        res.status(201).json(newImport);
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}));

// PATCH update status (escrow & milestone state machine) — Authenticated
router.patch('/:id/status', verifyAuth, handleAsyncError(async (req, res) => {
    const allowed = ['Confirmed', 'Customs Clearance', 'In Transit', 'Delivered', 'Cancelled'];
    if (!allowed.includes(req.body.status)) throw new ApiError('Invalid status', 400);

    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp) return res.status(404).json({ message: 'Purchase order not found' });

    // IDOR check: caller must be the buyer, the exporter, or admin
    const isBuyer = imp.userEmail === req.user.email;
    const isExporter = imp.productId && imp.productId.exporterEmail === req.user.email;
    if (!isBuyer && !isExporter && !req.user.isAdmin) {
        throw new ApiError('Not authorized to modify this purchase order', 403);
    }

    const previousStatus = imp.status;
    imp.status = req.body.status;

    // If order was cancelled, return reserved stock back to the product
    if (req.body.status === 'Cancelled' && previousStatus !== 'Cancelled' && imp.productId) {
        await Product.findByIdAndUpdate(imp.productId._id || imp.productId, {
            $inc: { quantity: imp.quantity }
        });
    }

    await imp.save();

    // Audit log state transition
    AuditLog.create({
        actorEmail: req.user.email,
        action: `PO_STATUS_${req.body.status.toUpperCase().replace(/\s+/g, '_')}`,
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { previousStatus, newStatus: req.body.status, poNumber: imp.poNumber },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(imp);
}));

// GET /api/imports/inbound/seller — Exporter Inbound Orders
router.get('/inbound/seller', verifyAuth, handleAsyncError(async (req, res) => {
    const exporterProducts = await Product.find({ exporterEmail: req.user.email }).select('_id');
    const productIds = exporterProducts.map(p => p._id);
    const inboundOrders = await Import.find({ productId: { $in: productIds } })
        .populate('productId')
        .sort({ createdAt: -1 });
    res.json(inboundOrders);
}));

// PATCH /api/imports/:id/seller-accept — Bilateral Exporter Acceptance
router.patch('/:id/seller-accept', verifyAuth, handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp) throw new ApiError('Purchase order not found', 404);
    if (imp.productId?.exporterEmail !== req.user.email && !req.user.isAdmin) {
        throw new ApiError('Only the exporter can accept this purchase order', 403);
    }
    imp.sellerAccepted = 'Accepted';
    await imp.save();
    res.json(imp);
}));

// PATCH /api/imports/:id/seller-reject — Bilateral Exporter Rejection
router.patch('/:id/seller-reject', verifyAuth, handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp) throw new ApiError('Purchase order not found', 404);
    if (imp.productId?.exporterEmail !== req.user.email && !req.user.isAdmin) {
        throw new ApiError('Only the exporter can decline this purchase order', 403);
    }
    imp.sellerAccepted = 'Declined';
    imp.status = 'Cancelled';
    await Product.findByIdAndUpdate(imp.productId._id || imp.productId, { $inc: { quantity: imp.quantity } });
    await imp.save();
    res.json(imp);
}));

// PATCH /api/imports/:id/escrow-fund — Buyer deposits into escrow
router.patch('/:id/escrow-fund', verifyAuth, handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id);
    if (!imp) throw new ApiError('Purchase order not found', 404);
    if (imp.userEmail !== req.user.email && !req.user.isAdmin) {
        throw new ApiError('Only the buyer can fund escrow for this order', 403);
    }
    imp.escrowStatus = 'Funded';
    await imp.save();
    res.json(imp);
}));

// PATCH /api/imports/:id/escrow-release — Buyer releases escrow funds
router.patch('/:id/escrow-release', verifyAuth, handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id);
    if (!imp) throw new ApiError('Purchase order not found', 404);
    if (imp.userEmail !== req.user.email && !req.user.isAdmin) {
        throw new ApiError('Only the buyer can release escrow funds', 403);
    }
    imp.escrowStatus = 'Released';
    await imp.save();
    res.json(imp);
}));

// PATCH /api/imports/:id/shipping — Update vessel & container telemetry
router.patch('/:id/shipping', verifyAuth, handleAsyncError(async (req, res) => {
    const { vesselName, vesselImo, containerNumber, billOfLadingUrl } = req.body;
    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp) throw new ApiError('Purchase order not found', 404);

    const isParty = imp.userEmail === req.user.email || imp.productId?.exporterEmail === req.user.email;
    if (!isParty && !req.user.isAdmin) {
        throw new ApiError('Not authorized to update shipping telemetry', 403);
    }

    if (vesselName !== undefined) imp.vesselName = vesselName;
    if (vesselImo !== undefined) imp.vesselImo = vesselImo;
    if (containerNumber !== undefined) imp.containerNumber = containerNumber;
    if (billOfLadingUrl !== undefined) imp.billOfLadingUrl = billOfLadingUrl;

    await imp.save();
    res.json(imp);
}));

// DELETE remove import — Authenticated (Owner or Admin)
router.delete('/:id', verifyAuth, handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id);
    if (!imp) {
        return res.status(404).json({ message: 'Import not found' });
    }

    // Ownership check (IDOR mitigation)
    if (imp.userEmail !== req.user.email && !req.user.isAdmin) {
        throw new ApiError('Not authorized to delete this purchase order', 403);
    }

    await Import.findByIdAndDelete(req.params.id);
    res.json({ message: 'Import removed successfully' });
}));

export default router;
