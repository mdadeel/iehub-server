import express from 'express';
import Product from '../models/Product.js';
import Import from '../models/Import.js';
import CompanyProfile from '../models/CompanyProfile.js';
import Dispute from '../models/Dispute.js';
import AuditLog from '../models/AuditLog.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// All admin routes strictly enforce verifyAuth and requireAdmin
router.use(verifyAuth, requireAdmin);

// GET /api/admin/metrics — Global Executive KPI snapshot
router.get('/metrics', handleAsyncError(async (req, res) => {
    const [products, imports, disputes, profiles] = await Promise.all([
        Product.find({}),
        Import.find({}),
        Dispute.find({}),
        CompanyProfile.find({}),
    ]);

    const totalGMV = imports.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const activeOrders = imports.filter(i => i.status !== 'Delivered' && i.status !== 'Cancelled').length;
    const pendingListings = products.filter(p => p.verificationStatus === 'pending').length;
    const openDisputes = disputes.filter(d => d.status === 'Open' || d.status === 'UnderReview').length;
    const pendingKYB = profiles.filter(p => p.kybStatus === 'Pending' || p.kybStatus === 'Requires Review').length;

    res.json({
        totalGMV,
        activeOrders,
        totalListings: products.length,
        pendingListings,
        openDisputes,
        pendingKYB,
        totalEntities: profiles.length,
    });
}));

// GET /api/admin/orders — Global Trade Order Registry
router.get('/orders', handleAsyncError(async (req, res) => {
    const orders = await Import.find({})
        .populate('productId')
        .sort({ createdAt: -1 })
        .limit(100);
    res.json(orders);
}));

// GET /api/admin/entities — Corporate Entity Directory & KYB review
router.get('/entities', handleAsyncError(async (req, res) => {
    const entities = await CompanyProfile.find({}).sort({ updatedAt: -1 });
    res.json(entities);
}));

// PATCH /api/admin/entities/:email/kyb — Approve or reject corporate KYB
router.patch('/entities/:email/kyb', handleAsyncError(async (req, res) => {
    const { kybStatus } = req.body;
    if (!['Pending', 'Verified', 'Requires Review', 'Suspended'].includes(kybStatus)) {
        throw new ApiError('Invalid KYB status', 400);
    }

    const updated = await CompanyProfile.findOneAndUpdate(
        { userEmail: req.params.email },
        { kybStatus },
        { new: true }
    );

    if (!updated) throw new ApiError('Entity not found', 404);

    AuditLog.create({
        actorEmail: req.user.email,
        action: `KYB_${kybStatus.toUpperCase().replace(/\s+/g, '_')}`,
        targetEntity: 'CompanyProfile',
        targetId: String(updated._id),
        details: { targetEmail: req.params.email, kybStatus },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(updated);
}));

// GET /api/admin/audit-logs — System Mutation Stream
router.get('/audit-logs', handleAsyncError(async (req, res) => {
    const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(100);
    res.json(logs);
}));

export default router;
