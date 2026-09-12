import express from 'express';
import mongoose from 'mongoose';
import Import from '../models/Import.js';
import Product from '../models/Product.js';
import Document from '../models/Document.js';
import AuditLog from '../models/AuditLog.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { resolveOrg } from '../middleware/resolveOrg.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { dispatchWebhookEvent } from '../services/webhookService.js';

const router = express.Router();

// GET imports by user email or active organization — Authenticated
router.get('/:email', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    // Multi-tenant check: caller must be user, member of buyer org, or admin
    const isSelf = req.user.email === req.params.email.toLowerCase();
    const isAdmin = req.user.isAdmin;
    const isOrgAdmin = req.orgId && req.membership && ['Owner', 'Admin', 'Manager', 'Agent'].includes(req.membership.orgRole);

    if (!isSelf && !isAdmin && !isOrgAdmin) {
        throw new ApiError('Not authorized to access purchase orders for this entity', 403);
    }

    let query = { userEmail: req.params.email.toLowerCase(), deletedAt: null };
    if (req.orgId) {
        query = {
            $or: [
                { buyerOrganizationId: req.orgId },
                { organizationId: req.orgId },
                { userEmail: req.params.email.toLowerCase() },
            ],
            deletedAt: null,
        };
    }

    const imports = await Import.find(query).populate('productId').sort({ createdAt: -1 });
    res.json(imports);
}));

// POST create import / issue Purchase Order — Authenticated + Transaction Wrapped
router.post('/', verifyAuth, resolveOrg, requirePermission('import:create'), handleAsyncError(async (req, res) => {
    const { productId, quantity, destinationPort, paymentTerms, laycanWindow, contractNotes, incoterm: reqIncoterm } = req.body;

    // Bind identity strictly from authenticated token and resolved tenant
    const userId = req.user.uid;
    const userEmail = req.user.email;
    const buyerOrgId = req.orgId || null;

    if (!productId || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
        throw new ApiError('Invalid productId or quantity (must be a positive integer)', 400);
    }

    // Wrap inventory decrement and PO creation in atomic Mongoose transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const updatedProduct = await Product.findOneAndUpdate(
            { _id: productId, quantity: { $gte: quantity }, deletedAt: null },
            { $inc: { quantity: -quantity } },
            { new: true, session }
        );

        if (!updatedProduct) {
            const productExists = await Product.findById(productId).session(session);
            if (!productExists || productExists.deletedAt) {
                await session.abortTransaction();
                return res.status(404).json({ message: 'Product not found' });
            }
            await session.abortTransaction();
            return res.status(400).json({ message: 'Insufficient stock available for this order volume' });
        }

        const supplierOrgId = updatedProduct.organizationId || updatedProduct.orgId || null;
        const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        const unitPrice = updatedProduct.price || 0;
        const totalAmount = unitPrice * quantity;
        const incoterm = reqIncoterm || updatedProduct.incoterm || 'FOB';
        const unit = updatedProduct.unit || 'Metric Tons (MT)';

        const newImport = new Import({
            organizationId: buyerOrgId,
            buyerOrganizationId: buyerOrgId,
            supplierOrganizationId: supplierOrgId,
            sellerOrgId: supplierOrgId,
            createdByUserId: userId,
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
            contractNotes: contractNotes || '',
        });

        await newImport.save({ session });
        await session.commitTransaction();

        // Audit log PO creation with tenant context
        AuditLog.create({
            orgId: buyerOrgId,
            actorEmail: userEmail,
            action: 'PO_ISSUED',
            targetEntity: 'Import',
            targetId: String(newImport._id),
            details: { poNumber, totalAmount, productId, quantity, buyerOrgId, supplierOrgId },
            ipAddress: req.ip || '',
        }).catch(err => console.error('Audit log failed:', err));

        if (buyerOrgId) dispatchWebhookEvent(buyerOrgId, 'order.created', { orderId: newImport._id, poNumber, totalAmount, status: newImport.status });
        if (supplierOrgId) dispatchWebhookEvent(supplierOrgId, 'order.created', { orderId: newImport._id, poNumber, totalAmount, status: newImport.status });

        res.status(201).json(newImport);
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}));

// PATCH update status (escrow & milestone state machine) — Authenticated
router.patch('/:id/status', verifyAuth, resolveOrg, requirePermission('import:status'), handleAsyncError(async (req, res) => {
    const allowed = ['Confirmed', 'Cargo Received', 'Customs Clearance', 'In Transit', 'Delivered', 'Completed', 'Cancelled'];
    if (!allowed.includes(req.body.status)) {
        throw new ApiError(`Invalid status. Allowed: ${allowed.join(', ')}`, 400);
    }

    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp || imp.deletedAt) return res.status(404).json({ message: 'Purchase order not found' });

    // Multi-tenant check: caller must be from buyer org, supplier org, or platform admin
    const isBuyer = imp.userEmail === req.user.email ||
                    (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.organizationId && req.orgId && String(imp.organizationId) === String(req.orgId));

    const isSupplier = (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                       (imp.productId && imp.productId.exporterEmail === req.user.email);

    if (!isBuyer && !isSupplier && !req.user.isAdmin) {
        throw new ApiError('Not authorized to modify this purchase order for this organization', 403);
    }

    const previousStatus = imp.status;
    const newStatus = req.body.status;

    // 1. Role validation: Supplier advances fulfillment milestones
    if (['Cargo Received', 'Customs Clearance', 'In Transit'].includes(newStatus)) {
        if (!isSupplier && !req.user.isAdmin) {
            throw new ApiError('Only the supplier organization can advance fulfillment milestones (Cargo, Customs, Transit)', 403);
        }
        if (imp.sellerAccepted !== 'Accepted' && !req.user.isAdmin) {
            throw new ApiError('Cannot advance order milestone before bilateral seller acceptance', 400);
        }
    }

    // 2. Prerequisites for ocean transit: must have vessel, container, or bill of lading
    if (newStatus === 'In Transit') {
        const hasVessel = Boolean(req.body.vesselName || imp.vesselName);
        const hasBol = Boolean(req.body.billOfLadingUrl || imp.billOfLadingUrl);
        const hasContainer = Boolean(req.body.containerNumber || imp.containerNumber);
        if (!hasVessel && !hasBol && !hasContainer) {
            throw new ApiError('Ocean transit milestone requires vessel name, container number, or bill of lading reference', 400);
        }
        if (req.body.vesselName) imp.vesselName = req.body.vesselName;
        if (req.body.vesselImo) imp.vesselImo = req.body.vesselImo;
        if (req.body.containerNumber) imp.containerNumber = req.body.containerNumber;
        if (req.body.billOfLadingUrl) imp.billOfLadingUrl = req.body.billOfLadingUrl;
    }

    // 3. Buyer confirmation for Delivered / Completed
    if (['Delivered', 'Completed'].includes(newStatus)) {
        if (!isBuyer && !req.user.isAdmin) {
            throw new ApiError('Only the buyer organization can confirm delivery receipt and completion', 403);
        }
        imp.deliveryAcceptedByEmail = req.user.email;
        imp.deliveryAcceptedAt = new Date();
        imp.deliverySignoffNotes = req.body.notes || 'Buyer verified cargo receipt and discharged goods.';
        if (imp.escrowStatus === 'Funded') {
            imp.escrowStatus = 'Released';
        }
    }

    // 4. Return reserved stock if cancelled
    if (newStatus === 'Cancelled' && previousStatus !== 'Cancelled' && imp.productId) {
        await Product.findByIdAndUpdate(imp.productId._id || imp.productId, {
            $inc: { quantity: imp.quantity }
        });
    }

    imp.status = newStatus;

    // 5. Append milestone history
    if (!imp.milestones) imp.milestones = [];
    imp.milestones.push({
        status: newStatus,
        updatedByEmail: req.user.email,
        updatedAt: new Date(),
        notes: req.body.notes || '',
        location: req.body.location || '',
        documentId: req.body.documentId || null,
    });

    await imp.save();

    // Audit log state transition
    AuditLog.create({
        orgId: req.orgId || imp.organizationId || null,
        actorEmail: req.user.email,
        action: `PO_STATUS_${newStatus.toUpperCase().replace(/\s+/g, '_')}`,
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { previousStatus, newStatus, poNumber: imp.poNumber },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    if (imp.buyerOrganizationId) dispatchWebhookEvent(imp.buyerOrganizationId, 'order.status_updated', { orderId: imp._id, poNumber: imp.poNumber, status: imp.status, previousStatus });
    if (imp.supplierOrganizationId) dispatchWebhookEvent(imp.supplierOrganizationId, 'order.status_updated', { orderId: imp._id, poNumber: imp.poNumber, status: imp.status, previousStatus });

    res.json(imp);
}));

// PATCH /api/imports/:id/confirm-delivery — Buyer formal delivery sign-off & escrow settlement
router.patch('/:id/confirm-delivery', verifyAuth, resolveOrg, requirePermission('import:update:own'), handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isBuyer = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.userEmail === req.user.email) ||
                    req.user.isAdmin;

    if (!isBuyer) {
        throw new ApiError('Only the consignee (buyer organization) can execute delivery sign-off', 403);
    }

    if (imp.status !== 'In Transit' && imp.status !== 'Customs Clearance') {
        throw new ApiError(`Delivery sign-off cannot be performed while status is "${imp.status}". Order must be in transit or clearing customs.`, 400);
    }

    const previousStatus = imp.status;
    imp.status = 'Delivered';
    imp.deliveryAcceptedByEmail = req.user.email;
    imp.deliveryAcceptedAt = new Date();
    imp.deliverySignoffNotes = req.body.signoffNotes || 'Goods inspected and received in good order.';

    // Fiduciary Escrow Settlement: release escrow if funds were locked
    if (imp.escrowStatus === 'Funded') {
        imp.escrowStatus = 'Released';
    }

    if (!imp.milestones) imp.milestones = [];
    imp.milestones.push({
        status: 'Delivered',
        updatedByEmail: req.user.email,
        updatedAt: new Date(),
        notes: imp.deliverySignoffNotes,
        location: imp.destinationPort || 'Designated Port',
    });

    await imp.save();

    AuditLog.create({
        orgId: req.orgId || imp.organizationId || null,
        actorEmail: req.user.email,
        action: 'PO_DELIVERY_CONFIRMED',
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { poNumber: imp.poNumber, previousStatus, escrowStatus: imp.escrowStatus },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    if (imp.buyerOrganizationId) dispatchWebhookEvent(imp.buyerOrganizationId, 'order.delivered', { orderId: imp._id, poNumber: imp.poNumber, status: 'Delivered', deliveredAt: imp.deliveryAcceptedAt });
    if (imp.supplierOrganizationId) dispatchWebhookEvent(imp.supplierOrganizationId, 'order.delivered', { orderId: imp._id, poNumber: imp.poNumber, status: 'Delivered', deliveredAt: imp.deliveryAcceptedAt });

    res.json(imp);
}));

// GET /api/imports/:id/documents — List documents attached to this PO
router.get('/:id/documents', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id);
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isParty = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                    imp.userEmail === req.user.email ||
                    req.user.isAdmin;

    if (!isParty) {
        throw new ApiError('Not authorized to access documents for this purchase order', 403);
    }

    const docs = await Document.find({
        tradeRecordId: imp._id,
        deletedAt: null,
    }).sort({ createdAt: -1 });

    res.json(docs);
}));

// PATCH /api/imports/:id/attach-document — Link an existing vault document to this PO
router.patch('/:id/attach-document', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const { documentId } = req.body;
    if (!documentId) throw new ApiError('documentId is required', 400);

    const imp = await Import.findById(req.params.id);
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isParty = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                    imp.userEmail === req.user.email ||
                    req.user.isAdmin;

    if (!isParty) {
        throw new ApiError('Not authorized to attach documents to this purchase order', 403);
    }

    const doc = await Document.findById(documentId);
    if (!doc || doc.deletedAt) throw new ApiError('Document not found', 404);

    // Link document to PO
    doc.tradeRecordId = imp._id;
    doc.tradeRecordModel = 'Import';
    await doc.save();

    // If document is Bill of Lading, also set billOfLadingUrl on Import if not already set
    if (doc.documentType === 'BillOfLading' && !imp.billOfLadingUrl) {
        imp.billOfLadingUrl = `/api/documents/${doc._id}/download-url`;
        await imp.save();
    }

    res.json({ message: 'Document attached successfully', document: doc });
}));

// GET /api/imports/inbound/seller — Exporter Inbound Orders
router.get('/inbound/seller', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    let filter = { deletedAt: null };

    if (req.orgId) {
        filter.$or = [
            { supplierOrganizationId: req.orgId },
            { sellerOrgId: req.orgId },
        ];
    } else {
        const exporterProducts = await Product.find({ exporterEmail: req.user.email }).select('_id');
        const productIds = exporterProducts.map(p => p._id);
        filter.productId = { $in: productIds };
    }

    const inboundOrders = await Import.find(filter)
        .populate('productId')
        .sort({ createdAt: -1 });

    res.json(inboundOrders);
}));

// PATCH /api/imports/:id/seller-accept — Bilateral Exporter Acceptance
router.patch('/:id/seller-accept', verifyAuth, resolveOrg, requirePermission('import:seller-accept|seller-reject'), handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isSupplier = (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                       (imp.productId?.exporterEmail === req.user.email) ||
                       req.user.isAdmin;

    if (!isSupplier) {
        throw new ApiError('Only the supplier organization can accept this purchase order', 403);
    }

    imp.sellerAccepted = 'Accepted';
    await imp.save();

    AuditLog.create({
        orgId: req.orgId || imp.supplierOrganizationId || null,
        actorEmail: req.user.email,
        action: 'PO_SELLER_ACCEPTED',
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { poNumber: imp.poNumber },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(imp);
}));

// PATCH /api/imports/:id/seller-reject — Bilateral Exporter Rejection
router.patch('/:id/seller-reject', verifyAuth, resolveOrg, requirePermission('import:seller-accept|seller-reject'), handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isSupplier = (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                       (imp.productId?.exporterEmail === req.user.email) ||
                       req.user.isAdmin;

    if (!isSupplier) {
        throw new ApiError('Only the supplier organization can decline this purchase order', 403);
    }

    imp.sellerAccepted = 'Declined';
    imp.status = 'Cancelled';
    await Product.findByIdAndUpdate(imp.productId._id || imp.productId, { $inc: { quantity: imp.quantity } });
    await imp.save();

    AuditLog.create({
        orgId: req.orgId || imp.supplierOrganizationId || null,
        actorEmail: req.user.email,
        action: 'PO_SELLER_REJECTED',
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { poNumber: imp.poNumber },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(imp);
}));

// PATCH /api/imports/:id/escrow-fund — Buyer deposits into escrow
router.patch('/:id/escrow-fund', verifyAuth, resolveOrg, requirePermission('escrow:fund'), handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id);
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isBuyer = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.userEmail === req.user.email) ||
                    req.user.isAdmin;

    if (!isBuyer) {
        throw new ApiError('Only the buyer organization can fund escrow for this order', 403);
    }

    imp.escrowStatus = 'Funded';
    await imp.save();

    AuditLog.create({
        orgId: req.orgId || imp.organizationId || null,
        actorEmail: req.user.email,
        action: 'ESCROW_FUNDED',
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { poNumber: imp.poNumber, totalAmount: imp.totalAmount },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(imp);
}));

// PATCH /api/imports/:id/escrow-release — Buyer releases escrow funds
router.patch('/:id/escrow-release', verifyAuth, resolveOrg, requirePermission('escrow:release'), handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id);
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isBuyer = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.userEmail === req.user.email) ||
                    req.user.isAdmin;

    if (!isBuyer) {
        throw new ApiError('Only the buyer organization can release escrow funds', 403);
    }

    imp.escrowStatus = 'Released';
    await imp.save();

    AuditLog.create({
        orgId: req.orgId || imp.organizationId || null,
        actorEmail: req.user.email,
        action: 'ESCROW_RELEASED',
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { poNumber: imp.poNumber, totalAmount: imp.totalAmount },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(imp);
}));

// PATCH /api/imports/:id/shipping — Update vessel & container telemetry
router.patch('/:id/shipping', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const { vesselName, vesselImo, containerNumber, billOfLadingUrl } = req.body;
    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isParty = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                    imp.userEmail === req.user.email ||
                    imp.productId?.exporterEmail === req.user.email ||
                    req.user.isAdmin;

    if (!isParty) {
        throw new ApiError('Not authorized to update shipping telemetry for this order', 403);
    }

    if (vesselName !== undefined) imp.vesselName = vesselName;
    if (vesselImo !== undefined) imp.vesselImo = vesselImo;
    if (containerNumber !== undefined) imp.containerNumber = containerNumber;
    if (billOfLadingUrl !== undefined) imp.billOfLadingUrl = billOfLadingUrl;

    if (req.body.status && req.body.status !== imp.status) {
        const validLogisticsStatuses = ['Cargo Received', 'Customs Clearance', 'In Transit'];
        if (validLogisticsStatuses.includes(req.body.status)) {
            imp.status = req.body.status;
            if (!imp.milestones) imp.milestones = [];
            imp.milestones.push({
                status: req.body.status,
                updatedByEmail: req.user.email,
                updatedAt: new Date(),
                notes: req.body.notes || `Logistics updated: ${vesselName || imp.vesselName || 'carrier manifest'}`,
                location: req.body.location || imp.destinationPort || '',
            });
        }
    }

    await imp.save();
    res.json(imp);
}));

// DELETE remove import — Authenticated (Buyer or Admin)
router.delete('/:id', verifyAuth, resolveOrg, requirePermission('import:update:own'), handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id);
    if (!imp || imp.deletedAt) {
        return res.status(404).json({ message: 'Import not found' });
    }

    const isBuyer = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.userEmail === req.user.email) ||
                    req.user.isAdmin;

    if (!isBuyer) {
        throw new ApiError('Not authorized to delete this purchase order', 403);
    }

    imp.deletedAt = new Date();
    await imp.save();
    res.json({ message: 'Import removed successfully' });
}));

// GET /api/imports/:id/messages — Order-level messaging & collaboration thread
router.get('/:id/messages', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const imp = await Import.findById(req.params.id)
        .populate('messages.documentId')
        .populate('productId');
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isParty = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                    imp.userEmail === req.user.email ||
                    imp.productId?.exporterEmail === req.user.email ||
                    req.user.isAdmin;

    if (!isParty) {
        throw new ApiError('Not authorized to access messages for this purchase order', 403);
    }

    res.json(imp.messages || []);
}));

// POST /api/imports/:id/messages — Send a collaboration message / trade update
router.post('/:id/messages', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const { message, documentId } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        throw new ApiError('Message text is required', 400);
    }

    const imp = await Import.findById(req.params.id).populate('productId');
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isBuyer = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    imp.userEmail === req.user.email;
    const isSupplier = (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                       imp.productId?.exporterEmail === req.user.email;

    if (!isBuyer && !isSupplier && !req.user.isAdmin) {
        throw new ApiError('Not authorized to post messages on this purchase order', 403);
    }

    const senderRole = req.user.isAdmin ? 'Admin' : isBuyer ? 'Buyer' : 'Supplier';

    const newMsg = {
        senderUserId: req.user.uid,
        senderEmail: req.user.email,
        senderOrgId: req.orgId || null,
        senderRole,
        message: message.trim(),
        documentId: documentId || null,
        createdAt: new Date(),
    };

    if (!imp.messages) imp.messages = [];
    imp.messages.push(newMsg);
    await imp.save();

    AuditLog.create({
        orgId: req.orgId || imp.organizationId || null,
        actorEmail: req.user.email,
        action: 'ORDER_MESSAGE_SENT',
        targetEntity: 'Import',
        targetId: String(imp._id),
        details: { poNumber: imp.poNumber, senderRole },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(201).json(newMsg);
}));

export default router;
