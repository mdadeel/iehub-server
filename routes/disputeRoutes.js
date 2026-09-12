import express from 'express';
import Dispute from '../models/Dispute.js';
import Import from '../models/Import.js';
import Document from '../models/Document.js';
import AuditLog from '../models/AuditLog.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { resolveOrg } from '../middleware/resolveOrg.js';
import { dispatchWebhookEvent } from '../services/webhookService.js';

const router = express.Router();

// GET /api/disputes — List disputes for caller, active organization, or all for admin
router.get('/', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    let query = { deletedAt: null };

    if (!req.user.isAdmin) {
        if (req.orgId) {
            query.$or = [
                { claimantOrganizationId: req.orgId },
                { respondentOrganizationId: req.orgId },
                { claimantEmail: req.user.email },
                { respondentEmail: req.user.email },
            ];
        } else {
            query.$or = [{ claimantEmail: req.user.email }, { respondentEmail: req.user.email }];
        }
    }

    const disputes = await Dispute.find(query)
        .populate('evidenceDocumentIds')
        .populate('counterEvidenceDocumentIds')
        .sort({ createdAt: -1 });
    res.json(disputes);
}));

// POST /api/disputes — File a commercial dispute against an order
router.post('/', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const importId = req.body.importId || req.body.orderId;
    const reason = req.body.reason;
    const claimAmount = req.body.claimAmount || req.body.disputedAmount;
    const evidenceNotes = req.body.evidenceNotes || req.body.description;

    if (!importId || !reason || !evidenceNotes) {
        throw new ApiError('Missing required fields: orderId (or importId), reason, description (or evidenceNotes)', 400);
    }

    const imp = await Import.findById(importId).populate('productId');
    if (!imp || imp.deletedAt) throw new ApiError('Purchase order not found', 404);

    const isBuyer = (imp.buyerOrganizationId && req.orgId && String(imp.buyerOrganizationId) === String(req.orgId)) ||
                    imp.userEmail === req.user.email;
    const isExporter = (imp.supplierOrganizationId && req.orgId && String(imp.supplierOrganizationId) === String(req.orgId)) ||
                       (imp.productId && imp.productId.exporterEmail === req.user.email);

    if (!isBuyer && !isExporter && !req.user.isAdmin) {
        throw new ApiError('Not authorized to file a dispute on this order for this organization', 403);
    }

    const disputeNumber = `DSP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const claimantOrgId = isBuyer ? (imp.buyerOrganizationId || req.orgId) : (imp.supplierOrganizationId || req.orgId);
    const respondentOrgId = isBuyer ? (imp.supplierOrganizationId || imp.productId?.organizationId) : imp.buyerOrganizationId;

    const respondentEmail = isBuyer 
        ? (imp.productId?.exporterEmail || 'desk@importexport.com') 
        : imp.userEmail;

    const dispute = new Dispute({
        organizationId: claimantOrgId || null,
        claimantOrganizationId: claimantOrgId || null,
        respondentOrganizationId: respondentOrgId || null,
        orgId: claimantOrgId || null,
        createdByUserId: req.user.uid,
        disputeNumber,
        importId: imp._id,
        poNumber: imp.poNumber,
        claimantEmail: req.user.email,
        respondentEmail,
        reason,
        claimAmount: Number(claimAmount) || imp.totalAmount,
        evidenceNotes,
        evidenceDocumentIds: req.body.evidenceDocumentIds || [],
        status: 'Open',
    });

    await dispute.save();

    // Link uploaded evidence documents to this dispute
    if (Array.isArray(req.body.evidenceDocumentIds) && req.body.evidenceDocumentIds.length > 0) {
        await Document.updateMany(
            { _id: { $in: req.body.evidenceDocumentIds } },
            { $set: { tradeRecordId: dispute._id, tradeRecordModel: 'Dispute' } }
        );
    }

    // Freeze the order in Disputed status
    imp.status = 'Disputed';
    imp.escrowStatus = 'Disputed';
    await imp.save();

    AuditLog.create({
        orgId: claimantOrgId || null,
        actorEmail: req.user.email,
        action: 'DISPUTE_FILED',
        targetEntity: 'Dispute',
        targetId: String(dispute._id),
        details: { disputeNumber, poNumber: imp.poNumber, reason, claimantOrgId, respondentOrgId },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    if (claimantOrgId) dispatchWebhookEvent(claimantOrgId, 'dispute.created', { disputeId: dispute._id, disputeNumber, poNumber: imp.poNumber, reason });
    if (respondentOrgId) dispatchWebhookEvent(respondentOrgId, 'dispute.created', { disputeId: dispute._id, disputeNumber, poNumber: imp.poNumber, reason });

    res.status(201).json(dispute);
}));

// GET /api/disputes/:id — Single dispute details with populated evidence documents
router.get('/:id', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const dispute = await Dispute.findById(req.params.id)
        .populate('evidenceDocumentIds')
        .populate('counterEvidenceDocumentIds')
        .populate('importId');
    if (!dispute || dispute.deletedAt) throw new ApiError('Dispute not found', 404);

    const isParty = (dispute.claimantOrganizationId && req.orgId && String(dispute.claimantOrganizationId) === String(req.orgId)) ||
                    (dispute.respondentOrganizationId && req.orgId && String(dispute.respondentOrganizationId) === String(req.orgId)) ||
                    dispute.claimantEmail === req.user.email ||
                    dispute.respondentEmail === req.user.email ||
                    req.user.isAdmin;

    if (!isParty) {
        throw new ApiError('Not authorized to view this dispute', 403);
    }

    res.json(dispute);
}));

// PATCH /api/disputes/:id/respond — Respondent counter-evidence submission
router.patch('/:id/respond', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const { counterEvidenceNotes, counterEvidenceDocumentIds } = req.body;
    if (!counterEvidenceNotes) {
        throw new ApiError('Counter-evidence notes or statement is required', 400);
    }

    const dispute = await Dispute.findById(req.params.id);
    if (!dispute || dispute.deletedAt) throw new ApiError('Dispute not found', 404);

    const isRespondent = (dispute.respondentOrganizationId && req.orgId && String(dispute.respondentOrganizationId) === String(req.orgId)) ||
                         dispute.respondentEmail === req.user.email ||
                         req.user.isAdmin;

    if (!isRespondent) {
        throw new ApiError('Only the respondent entity can submit counter-evidence', 403);
    }

    dispute.counterEvidenceNotes = counterEvidenceNotes;
    if (Array.isArray(counterEvidenceDocumentIds) && counterEvidenceDocumentIds.length > 0) {
        dispute.counterEvidenceDocumentIds = counterEvidenceDocumentIds;
        await Document.updateMany(
            { _id: { $in: counterEvidenceDocumentIds } },
            { $set: { tradeRecordId: dispute._id, tradeRecordModel: 'Dispute' } }
        );
    }

    if (dispute.status === 'Open') {
        dispute.status = 'UnderReview';
    }

    await dispute.save();

    AuditLog.create({
        orgId: dispute.respondentOrganizationId || null,
        actorEmail: req.user.email,
        action: 'DISPUTE_RESPONDED',
        targetEntity: 'Dispute',
        targetId: String(dispute._id),
        details: { disputeNumber: dispute.disputeNumber },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(dispute);
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
    if (!dispute || dispute.deletedAt) throw new ApiError('Dispute not found', 404);

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
        orgId: dispute.claimantOrganizationId || null,
        actorEmail: req.user.email,
        action: `DISPUTE_${(resolution || 'RESOLVED').toUpperCase().replace(/\s+/g, '_')}`,
        targetEntity: 'Dispute',
        targetId: String(dispute._id),
        details: { disputeNumber: dispute.disputeNumber, resolution, resolutionNotes },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    if (dispute.claimantOrganizationId) dispatchWebhookEvent(dispute.claimantOrganizationId, 'dispute.resolved', { disputeId: dispute._id, disputeNumber: dispute.disputeNumber, resolution });
    if (dispute.respondentOrganizationId) dispatchWebhookEvent(dispute.respondentOrganizationId, 'dispute.resolved', { disputeId: dispute._id, disputeNumber: dispute.disputeNumber, resolution });

    res.json(dispute);
}));

export default router;
