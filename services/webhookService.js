import crypto from 'crypto';
import WebhookSubscription from '../models/WebhookSubscription.js';
import logger from '../utils/logger.js';

/**
 * Sign payload using HMAC-SHA256
 * @param {string} secret - Webhook secret key
 * @param {object|string} payload - JSON payload
 * @param {number|string} timestamp - Unix timestamp in seconds
 * @returns {string} - HMAC-SHA256 hex digest
 */
export const signPayload = (secret, payload, timestamp) => {
    const stringified = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signaturePayload = `${timestamp}.${stringified}`;
    return crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
};

/**
 * Verify HMAC-SHA256 signature in constant time
 * @param {string} secret 
 * @param {object|string} payload 
 * @param {number|string} timestamp 
 * @param {string} signature - Expected hex signature or 'sha256=...' format
 * @returns {boolean}
 */
export const verifySignature = (secret, payload, timestamp, signature) => {
    try {
        const rawSig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
        const expected = signPayload(secret, payload, timestamp);
        const expectedBuffer = Buffer.from(expected, 'hex');
        const actualBuffer = Buffer.from(rawSig, 'hex');

        if (expectedBuffer.length !== actualBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
        return false;
    }
};

/**
 * Deliver a single webhook event to a subscription endpoint
 * @param {WebhookSubscription} subscription 
 * @param {string} eventName 
 * @param {object} eventData 
 * @returns {Promise<{success: boolean, statusCode?: number, error?: string}>}
 */
export const deliverWebhook = async (subscription, eventName, eventData) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const eventId = `evt_${crypto.randomUUID()}`;

    const envelope = {
        id: eventId,
        event: eventName,
        timestamp,
        organizationId: subscription.organizationId,
        data: eventData,
    };

    const signature = signPayload(subscription.secret, envelope, timestamp);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(subscription.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'IEHUB-Webhooks/1.0',
                'X-IEHUB-Event': eventName,
                'X-IEHUB-Event-Id': eventId,
                'X-IEHUB-Timestamp': String(timestamp),
                'X-IEHUB-Signature': `sha256=${signature}`,
            },
            body: JSON.stringify(envelope),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const statusCode = response.status;
        const isSuccess = statusCode >= 200 && statusCode < 300;

        await WebhookSubscription.findByIdAndUpdate(subscription._id, {
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: statusCode,
            lastDeliveryError: isSuccess ? null : `HTTP error ${statusCode}`,
            $inc: isSuccess ? { failureCount: -subscription.failureCount } : { failureCount: 1 },
        });

        return { success: isSuccess, statusCode };
    } catch (err) {
        const errorMsg = err.name === 'AbortError' ? 'Connection timed out (6s)' : err.message;
        await WebhookSubscription.findByIdAndUpdate(subscription._id, {
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: 0,
            lastDeliveryError: errorMsg,
            $inc: { failureCount: 1 },
        });

        logger.warn(`Webhook delivery failed for subscription ${subscription._id}`, {
            url: subscription.url,
            error: errorMsg,
        });

        return { success: false, statusCode: 0, error: errorMsg };
    }
};

/**
 * Dispatch an event asynchronously to all matching subscriptions for an organization
 * @param {string|mongoose.Types.ObjectId} organizationId 
 * @param {string} eventName 
 * @param {object} eventData 
 */
export const dispatchWebhookEvent = async (organizationId, eventName, eventData) => {
    if (!organizationId) return;

    try {
        const subscriptions = await WebhookSubscription.find({
            organizationId,
            isActive: true,
            $or: [{ events: '*' }, { events: eventName }],
        });

        if (!subscriptions.length) return;

        // Fire deliveries asynchronously without blocking caller
        Promise.allSettled(
            subscriptions.map(sub => deliverWebhook(sub, eventName, eventData))
        ).catch(err => {
            logger.error(`Error in dispatchWebhookEvent: ${err.message}`);
        });
    } catch (err) {
        logger.error(`Failed to find webhook subscriptions for org ${organizationId}: ${err.message}`);
    }
};

/**
 * Send a test ping event
 * @param {string} subscriptionId 
 * @param {string} callerEmail 
 */
export const sendTestPing = async (subscriptionId, callerEmail) => {
    const subscription = await WebhookSubscription.findById(subscriptionId);
    if (!subscription) throw new Error('Webhook subscription not found');

    const testData = {
        message: 'This is a test notification from the IEHUB Enterprise Webhook Engine.',
        testTimestamp: new Date().toISOString(),
        initiatedBy: callerEmail,
        supportedEvents: [
            'order.created',
            'order.status_updated',
            'order.delivered',
            'dispute.created',
            'dispute.resolved',
            'document.verified',
        ],
    };

    return await deliverWebhook(subscription, 'test.ping', testData);
};
