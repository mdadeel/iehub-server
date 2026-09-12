import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import productRoutes from './routes/productRoutes.js';
import importRoutes from './routes/importRoutes.js';
import configRoutes from './routes/configRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import rfqRoutes from './routes/rfqRoutes.js';
import disputeRoutes from './routes/disputeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import { defaultLimiter } from './middleware/rateLimiter.js';
import { globalErrorHandler } from './utils/errorHandler.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { validateEnv } from './config/validateEnv.js';
import logger from './utils/logger.js';

dotenv.config();

// Run configuration checks (non-blocking in test environment)
if (process.env.NODE_ENV !== 'test') {
    try {
        validateEnv();
    } catch {
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Request correlation ID tracing — must be very first middleware
app.use(correlationIdMiddleware);

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug(`${req.method} ${req.originalUrl} [${res.statusCode}] - ${duration}ms`, {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: duration,
            correlationId: req.correlationId,
        });
    });
    next();
});

// Middleware — secure CORS: exact origin(s), no wildcard+credentials
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // curl/health checks
        if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

// Security headers (helmet-lite, zero extra dependencies)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

app.use(express.json({ limit: '10mb' }));

// Apply default sliding-window rate limiter
app.use(defaultLimiter);

// Routes
app.use('/api/config', configRoutes);
app.use('/api/products', productRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/rfq', rfqRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/analytics', analyticsRoutes);

// Enhanced deep health check endpoint
app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatusMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const isHealthy = dbState === 1 || process.env.NODE_ENV === 'test';

    const payload = {
        status: isHealthy ? 'OK' : 'Degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        correlationId: req.correlationId,
        database: {
            state: dbStatusMap[dbState] || 'unknown',
            readyState: dbState,
        },
    };

    res.status(isHealthy ? 200 : 503).json(payload);
});

app.get('/', (req, res) => {
    res.send('Import Export Hub API is running...');
});

// Global error handler middleware
app.use(globalErrorHandler);

// Database Connection & Server Startup
if (process.env.NODE_ENV !== 'test') {
    if (!process.env.MONGODB_URI) {
        logger.error('FATAL: MONGODB_URI not set in iehub-server/.env');
        process.exit(1);
    }
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            logger.info('Connected to MongoDB');
            app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
        })
        .catch((error) => {
            logger.error(`MongoDB connection error: ${error.message}`);
            process.exit(1);
        });
}

// Export for Vercel serverless and automated test suites
export default app;
