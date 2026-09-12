import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correlationIdMiddleware } from '../../middleware/correlationId.js';

describe('Correlation ID Middleware Unit Tests', () => {
    it('should generate a new UUID correlationId if header is missing', () => {
        const req = { headers: {} };
        const res = {
            headers: {},
            setHeader(key, value) {
                this.headers[key] = value;
            },
        };
        let nextCalled = false;

        correlationIdMiddleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.ok(typeof req.correlationId === 'string');
        assert.ok(req.correlationId.length > 20);
        assert.equal(res.headers['X-Correlation-ID'], req.correlationId);
    });

    it('should preserve and propagate client provided X-Correlation-ID', () => {
        const clientTraceId = 'client-trace-id-12345';
        const req = { headers: { 'x-correlation-id': clientTraceId } };
        const res = {
            headers: {},
            setHeader(key, value) {
                this.headers[key] = value;
            },
        };
        let nextCalled = false;

        correlationIdMiddleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(req.correlationId, clientTraceId);
        assert.equal(res.headers['X-Correlation-ID'], clientTraceId);
    });
});
