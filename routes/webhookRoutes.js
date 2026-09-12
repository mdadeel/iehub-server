import express from 'express';
import WebhookSubscription from '../models/WebhookSubscription.js';
import { sendTestPing } from '../services/webhookService.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { resolveOrg, requireOrg } from '../middleware/resolveOrg.js';

const router = express.Router();

// GET /api/webhooks — List subscriptions for active org (or all for admin)
router.get('/', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    let query = {};
    if (!req.user.isAdmin) {
        if (!req.orgId) {
            return res.json([]);
        }
        query.organizationId = req.orgId;
    } else if (req.query.orgId) {
        query.organizationId = req.query.orgId;
    }

    const subscriptions = await WebhookSubscription.find(query).sort({ createdAt: -1 });
    res.json(subscriptions);
}));

// POST /api/webhooks — Register a new outbound webhook endpoint
router.post('/', verifyAuth, resolveOrg, requireOrg, handleAsyncError(async (req, res) => {
    const { url, description, events } = req.body;

    if (!url) {
        throw new ApiError('Webhook endpoint URL is required', 400);
    }

    if (!/^https?:\/\/.+/i.test(url)) {
        throw new ApiError('Webhook URL must be a valid HTTP or HTTPS address', 400);
    }

    const subscription = new WebhookSubscription({
        organizationId: req.orgId,
        url: url.trim(),
        description: description ? description.trim() : '',
        events: Array.isArray(events) && events.length > 0 ? events : ['*'],
        createdByUserEmail: req.user.email,
    });

    await subscription.save();
    res.status(201).json(subscription);
}));

// PATCH /api/webhooks/:id — Update subscription details (URL, events, status)
router.patch('/:id', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const subscription = await WebhookSubscription.findById(req.params.id);
    if (!subscription) throw new ApiError('Webhook subscription not found', 404);

    if (!req.user.isAdmin && String(subscription.organizationId) !== String(req.orgId)) {
        throw new ApiError('Not authorized to modify this webhook subscription', 403);
    }

    const allowedUpdates = ['url', 'description', 'events', 'isActive'];
    for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
            subscription[key] = req.body[key];
        }
    }

    await subscription.save();
    res.json(subscription);
}));

// DELETE /api/webhooks/:id — Delete a webhook subscription
router.delete('/:id', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const subscription = await WebhookSubscription.findById(req.params.id);
    if (!subscription) throw new ApiError('Webhook subscription not found', 404);

    if (!req.user.isAdmin && String(subscription.organizationId) !== String(req.orgId)) {
        throw new ApiError('Not authorized to delete this webhook subscription', 403);
    }

    await WebhookSubscription.findByIdAndDelete(req.params.id);
    res.json({ message: 'Webhook subscription successfully removed' });
}));

// POST /api/webhooks/:id/test — Dispatch test ping to endpoint
router.post('/:id/test', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const subscription = await WebhookSubscription.findById(req.params.id);
    if (!subscription) throw new ApiError('Webhook subscription not found', 404);

    if (!req.user.isAdmin && String(subscription.organizationId) !== String(req.orgId)) {
        throw new ApiError('Not authorized to test this webhook subscription', 403);
    }

    const result = await sendTestPing(subscription._id, req.user.email);
    res.json({
        message: result.success ? 'Webhook test ping delivered successfully' : 'Webhook test ping failed',
        result,
    });
}));

export default router;
