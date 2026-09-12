import mongoose from 'mongoose';
import crypto from 'crypto';

export const SUPPORTED_WEBHOOK_EVENTS = [
    '*',
    'order.created',
    'order.status_updated',
    'order.delivered',
    'dispute.created',
    'dispute.resolved',
    'document.verified',
];

const webhookSubscriptionSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    url: {
        type: String,
        required: [true, 'Webhook endpoint URL is required'],
        trim: true,
        validate: {
            validator: (v) => /^https?:\/\/.+/i.test(v),
            message: 'Webhook URL must be a valid HTTP or HTTPS endpoint',
        },
    },
    description: {
        type: String,
        trim: true,
        default: '',
    },
    secret: {
        type: String,
        required: true,
        default: () => `whsec_${crypto.randomBytes(24).toString('hex')}`,
    },
    events: {
        type: [String],
        default: ['*'],
        validate: {
            validator: (events) => events.every(e => SUPPORTED_WEBHOOK_EVENTS.includes(e)),
            message: 'One or more webhook event names are invalid',
        },
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    lastDeliveryAt: {
        type: Date,
        default: null,
    },
    lastDeliveryStatus: {
        type: Number,
        default: null,
    },
    lastDeliveryError: {
        type: String,
        default: null,
    },
    failureCount: {
        type: Number,
        default: 0,
    },
    createdByUserEmail: {
        type: String,
        trim: true,
        lowercase: true,
        default: '',
    },
}, { timestamps: true });

const WebhookSubscription = mongoose.model('WebhookSubscription', webhookSubscriptionSchema);

export default WebhookSubscription;
