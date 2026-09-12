/**
 * Zero-dependency Sliding-Window In-Memory Rate Limiter
 */

export const createRateLimiter = ({
    windowMs = 60 * 1000, // 1 minute
    max = 120,           // 120 requests per window
    message = 'Too many requests from this IP/account, please try again later.',
    skipInTest = true,
} = {}) => {
    const hits = new Map();

    // Clean up stale entries every 60 seconds
    const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of hits.entries()) {
            if (now > record.resetTime) {
                hits.delete(key);
            }
        }
    }, 60 * 1000);

    // Don't keep Node process alive just for the cleanup timer
    if (interval.unref) {
        interval.unref();
    }

    return (req, res, next) => {
        if (skipInTest && process.env.NODE_ENV === 'test') {
            return next();
        }

        const clientKey = req.user?.email ||
                          req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                          req.socket?.remoteAddress ||
                          'anonymous';

        const now = Date.now();
        let record = hits.get(clientKey);

        if (!record || now > record.resetTime) {
            record = {
                count: 1,
                resetTime: now + windowMs,
            };
            hits.set(clientKey, record);
        } else {
            record.count += 1;
        }

        const remaining = Math.max(0, max - record.count);
        const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetSeconds);

        if (record.count > max) {
            res.setHeader('Retry-After', resetSeconds);
            return res.status(429).json({
                status: 'error',
                statusCode: 429,
                message,
                retryAfterSeconds: resetSeconds,
            });
        }

        next();
    };
};

export const defaultLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 200,
});

export const strictLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Rate limit exceeded for sensitive transaction operations.',
});
