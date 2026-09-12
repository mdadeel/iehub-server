import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import WebhookSubscription from '../../models/WebhookSubscription.js';
import { signPayload, verifySignature } from '../../services/webhookService.js';
import { createRateLimiter } from '../../middleware/rateLimiter.js';

describe('Webhooks & Enterprise Integration Unit Tests', () => {

    describe('HMAC-SHA256 Signature Verification', () => {
        const secret = 'whsec_test_secret_key_1234567890abcdef';
        const payload = {
            id: 'evt_123',
            event: 'order.created',
            data: { poNumber: 'PO-2026-001', amount: 50000 },
        };
        const timestamp = 1757678400;

        it('generates a valid hex HMAC-SHA256 signature for payload', () => {
            const signature = signPayload(secret, payload, timestamp);
            assert.ok(typeof signature === 'string');
            assert.equal(signature.length, 64); // 32 bytes in hex = 64 characters

            // Verify with standard crypto
            const expected = crypto.createHmac('sha256', secret)
                .update(`${timestamp}.${JSON.stringify(payload)}`)
                .digest('hex');
            assert.equal(signature, expected);
        });

        it('verifies signature correctly with and without sha256= prefix', () => {
            const signature = signPayload(secret, payload, timestamp);

            // Raw hex
            assert.equal(verifySignature(secret, payload, timestamp, signature), true);

            // With sha256= prefix
            assert.equal(verifySignature(secret, payload, timestamp, `sha256=${signature}`), true);
        });

        it('rejects tampered payload or altered timestamp', () => {
            const signature = signPayload(secret, payload, timestamp);

            const tamperedPayload = { ...payload, data: { poNumber: 'PO-2026-001', amount: 999999 } };
            assert.equal(verifySignature(secret, tamperedPayload, timestamp, signature), false);

            assert.equal(verifySignature(secret, payload, timestamp + 10, signature), false);
        });

        it('rejects incorrect secret key', () => {
            const signature = signPayload(secret, payload, timestamp);
            const wrongSecret = 'whsec_wrong_secret_key_0000000000';
            assert.equal(verifySignature(wrongSecret, payload, timestamp, signature), false);
        });
    });

    describe('WebhookSubscription Model Schema Validation', () => {
        it('validates a compliant WebhookSubscription instance', () => {
            const sub = new WebhookSubscription({
                organizationId: '666666666666666666666666',
                url: 'https://erp.example-enterprise.com/webhooks/iehub',
                description: 'SAP ERP Production Webhook',
                events: ['order.created', 'order.delivered'],
                createdByUserEmail: 'integrations@example-enterprise.com',
            });

            const error = sub.validateSync();
            assert.equal(error, undefined);
            assert.ok(sub.secret.startsWith('whsec_'));
            assert.equal(sub.isActive, true);
        });

        it('rejects invalid or non-HTTP/HTTPS webhook URLs', () => {
            const sub = new WebhookSubscription({
                organizationId: '666666666666666666666666',
                url: 'ftp://invalidscheme.com/webhook',
            });

            const error = sub.validateSync();
            assert.ok(error);
            assert.ok(error.errors.url);
        });

        it('rejects unsupported webhook event names', () => {
            const sub = new WebhookSubscription({
                organizationId: '666666666666666666666666',
                url: 'https://api.company.com/webhook',
                events: ['unsupported.fake.event'],
            });

            const error = sub.validateSync();
            assert.ok(error);
            assert.ok(error.errors.events);
        });
    });

    describe('Rate Limiter Middleware', () => {
        it('allows requests within window and sets rate limit headers', () => {
            const limiter = createRateLimiter({
                windowMs: 60000,
                max: 5,
                skipInTest: false,
            });

            const req = {
                headers: { 'x-forwarded-for': '198.51.100.1' },
                user: { email: 'rate-test@example.com' },
            };
            const headersSet = {};
            const res = {
                setHeader: (k, v) => { headersSet[k] = v; },
                status: (code) => ({
                    json: (data) => ({ code, data }),
                }),
            };
            let nextCalled = false;
            const next = () => { nextCalled = true; };

            limiter(req, res, next);
            assert.equal(nextCalled, true);
            assert.equal(headersSet['X-RateLimit-Limit'], 5);
            assert.equal(headersSet['X-RateLimit-Remaining'], 4);
        });

        it('blocks requests and returns 429 when max is exceeded', () => {
            const limiter = createRateLimiter({
                windowMs: 60000,
                max: 2,
                skipInTest: false,
            });

            const req = {
                headers: { 'x-forwarded-for': '203.0.113.42' },
            };
            const headersSet = {};
            let statusCode = 200;
            let responseBody = null;

            const res = {
                setHeader: (k, v) => { headersSet[k] = v; },
                status: (code) => {
                    statusCode = code;
                    return {
                        json: (data) => { responseBody = data; },
                    };
                },
            };

            // Request 1: allowed
            limiter(req, res, () => {});
            assert.equal(headersSet['X-RateLimit-Remaining'], 1);

            // Request 2: allowed
            limiter(req, res, () => {});
            assert.equal(headersSet['X-RateLimit-Remaining'], 0);

            // Request 3: blocked
            let thirdNextCalled = false;
            limiter(req, res, () => { thirdNextCalled = true; });

            assert.equal(thirdNextCalled, false);
            assert.equal(statusCode, 429);
            assert.equal(responseBody.status, 'error');
            assert.ok(headersSet['Retry-After']);
        });
    });
});
