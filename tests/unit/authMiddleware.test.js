import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAuth, requireAdmin } from '../../middleware/authMiddleware.js';

describe('Auth Middleware Security Tests', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.NODE_ENV = 'development';
        delete process.env.ENABLE_DEV_SANDBOX;
        delete process.env.ADMIN_EMAILS;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('should reject request missing Authorization header with 401', async () => {
        const req = { headers: {} };
        const res = {};
        let error = null;

        await verifyAuth(req, res, (err) => {
            error = err;
        });

        assert.ok(error, 'Expected error to be thrown');
        assert.equal(error.statusCode, 401);
        assert.match(error.message, /Authorization token required/);
    });

    it('should reject malformed Bearer token with 401', async () => {
        const req = { headers: { authorization: 'Basic 12345' } };
        const res = {};
        let error = null;

        await verifyAuth(req, res, (err) => {
            error = err;
        });

        assert.ok(error);
        assert.equal(error.statusCode, 401);
    });

    it('should REJECT guest-token when ENABLE_DEV_SANDBOX is false/unset', async () => {
        process.env.ENABLE_DEV_SANDBOX = 'false';
        const req = { headers: { authorization: 'Bearer guest-token-1234' } };
        const res = {};
        let error = null;

        await verifyAuth(req, res, (err) => {
            error = err;
        });

        assert.ok(error);
        assert.equal(error.statusCode, 401);
        assert.match(error.message, /Development authentication bypass is disabled/);
    });

    it('should REJECT demo-admin-token when in production even if ENABLE_DEV_SANDBOX is true', async () => {
        process.env.NODE_ENV = 'production';
        process.env.ENABLE_DEV_SANDBOX = 'true';
        const req = { headers: { authorization: 'Bearer demo-admin-token' } };
        const res = {};
        let error = null;

        await verifyAuth(req, res, (err) => {
            error = err;
        });

        assert.ok(error);
        assert.equal(error.statusCode, 401);
        assert.match(error.message, /Development authentication bypass is disabled/);
    });

    it('should ACCEPT demo-admin-token in dev when ENABLE_DEV_SANDBOX is true', async () => {
        process.env.NODE_ENV = 'development';
        process.env.ENABLE_DEV_SANDBOX = 'true';
        process.env.ADMIN_EMAILS = 'lead-admin@importexport.com';

        const req = { headers: { authorization: 'Bearer demo-admin-token' } };
        const res = {};
        let error = null;

        await verifyAuth(req, res, (err) => {
            error = err;
        });

        assert.equal(error, undefined);
        assert.ok(req.user);
        assert.equal(req.user.isAdmin, true);
        assert.equal(req.user.email, 'lead-admin@importexport.com');
    });

    it('should reject requireAdmin if user is not an admin', () => {
        const req = { user: { email: 'buyer@example.com', isAdmin: false } };
        const res = {};
        let error = null;

        requireAdmin(req, res, (err) => {
            error = err;
        });

        assert.ok(error);
        assert.equal(error.statusCode, 403);
        assert.match(error.message, /Administrative authority required/);
    });

    it('should permit requireAdmin if user is an admin', () => {
        const req = { user: { email: 'admin@importexport.com', isAdmin: true } };
        const res = {};
        let nextCalled = false;

        requireAdmin(req, res, (err) => {
            assert.equal(err, undefined);
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
    });
});
