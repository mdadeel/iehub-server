import express from 'express';
import Dispute from '../models/Dispute.js';
import Import from '../models/Import.js';
import AuditLog from '../models/AuditLog.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/disputes — List disputes for caller or all for admin
router.get('/', verifyAuth, handleAsyncError(async (req, res) => {
    let query = {};
    if (!req.user.isAdmin) {
        query = {
            $or: [{ claimantEmail: req.user.email }, { respondentEmail: req.user.email }]
        };
    }
    const disputes = await Dispute.find(query).sort({ createdAt: -1 });
    res.json(disputes);
}));

// POST /api/disputes — File a commercial dispute against an order
router.post('/', verifyAuth, handleAsyncError(async (req, res) => {
    const importId = req.body.importId || req.body.orderId;
    const reason = req.body.reason;
    const claimAmount = req.body.claimAmount || req.body.disputedAmount;
    const evidenceNotes = req.body.evidenceNotes || req.body.description;

    if (!importId || !reason || !evidenceNotes) {
        throw new ApiError('Missing required fields: orderId (or importId), reason, description (or evidenceNotes)', 400);
    }

    const imp = await Import.findById(importId).populate('productId');
    if (!imp) throw new ApiError('Purchase order not found', 404);

    const isBuyer = imp.userEmail === req.user.email;
    const isExporter = imp.productId && imp.productId.exporterEmail === req.user.email;
    if (!isBuyer && !isExporter && !req.user.isAdmin) {
        throw new ApiError('Not authorized to file a dispute on this order', 403);
    }

    const disputeNumber = `DSP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const respondentEmail = isBuyer 
        ? (imp.productId?.exporterEmail || 'desk@importexport.com') 
        : imp.userEmail;

    const dispute = new Dispute({
        disputeNumber,
        importId: imp._id,
        poNumber: imp.poNumber,
        claimantEmail: req.user.email,
        respondentEmail,
        reason,
        claimAmount: Number(claimAmount) || imp.totalAmount,
        evidenceNotes,
        status: 'Open',
    });

    await dispute.save();

    // Freeze the order in Disputed status
    imp.status = 'Disputed';
    imp.escrowStatus = 'Disputed';
    await imp.save();

    AuditLog.create({
        actorEmail: req.user.email,
        action: 'DISPUTE_FILED',
        targetEntity: 'Dispute',
        targetId: String(dispute._id),
        details: { disputeNumber, poNumber: imp.poNumber, reason },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.status(201).json(dispute);
}));

// PATCH /api/disputes/:id/resolve — Admin dispute mediation & fund disposition
router.patch('/:id/resolve', verifyAuth, requireAdmin, handleAsyncError(async (req, res) => {
    let { resolution, resolutionNotes } = req.body;
    let normalized = resolution;
    if (resolution === 'Buyer Refund') normalized = 'ResolvedRefund';
    else if (resolution === 'Seller Release') normalized = 'ResolvedRelease';
    else if (resolution === 'Split Settlement') normalized = 'ResolvedRefund';
    else if (resolution === 'Dismissed') normalized = 'Dismissed';

    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) throw new ApiError('Dispute not found', 404);

    dispute.status = 'Resolved';
    dispute.resolution = resolution || normalized;
    dispute.resolutionNotes = resolutionNotes || '';
    dispute.resolvedByEmail = req.user.email;
    dispute.resolvedAt = new Date();
    await dispute.save();

    // Update the underlying import order
    const imp = await Import.findById(dispute.importId);
    if (imp) {
        if (normalized === 'ResolvedRefund') {
            imp.status = 'Cancelled';
            imp.escrowStatus = 'Released'; // Refunded to buyer
        } else if (normalized === 'ResolvedRelease') {
            imp.status = 'Delivered';
            imp.escrowStatus = 'Released'; // Released to seller
        } else {
            imp.status = 'In Transit';
            imp.escrowStatus = 'Funded';
        }
        await imp.save();
    }

    AuditLog.create({
        actorEmail: req.user.email,
        action: `DISPUTE_${resolution.toUpperCase()}`,
        targetEntity: 'Dispute',
        targetId: String(dispute._id),
        details: { disputeNumber: dispute.disputeNumber, resolution, resolutionNotes },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(dispute);
}));

export default router;
