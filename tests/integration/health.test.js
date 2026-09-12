process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../index.js';

describe('Health Check API Integration Tests', () => {
    it('GET /api/health should return 200 with system diagnostics and correlation ID', async () => {
        const res = await request(app)
            .get('/api/health')
            .set('X-Correlation-ID', 'test-health-trace-999');

        assert.equal(res.status, 200);
        assert.ok(res.body);
        assert.equal(res.body.status, 'OK');
        assert.ok(res.body.timestamp);
        assert.ok(res.body.database);
        assert.equal(res.body.correlationId, 'test-health-trace-999');
        assert.equal(res.headers['x-correlation-id'], 'test-health-trace-999');
    });

    it('GET / should return running confirmation', async () => {
        const res = await request(app).get('/');
        assert.equal(res.status, 200);
        assert.match(res.text, /Import Export Hub API is running/);
    });
});
