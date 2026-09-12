import crypto from 'node:crypto';

/**
 * Correlation ID Middleware
 * Assigns or propagates an X-Correlation-ID for end-to-end request tracing.
 */
export const correlationIdMiddleware = (req, res, next) => {
    const rawId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
    const correlationId = (typeof rawId === 'string' && rawId.trim()) 
        ? rawId.trim().slice(0, 64) 
        : crypto.randomUUID();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
};

export default correlationIdMiddleware;
