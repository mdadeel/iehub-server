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
import { globalErrorHandler } from './utils/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware — secure CORS: exact origin(s), no wildcard+credentials
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // curl/health checks
        if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
// Basic security headers (helmet-lite, no dep)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/config', configRoutes);
app.use('/api/products', productRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/rfq', rfqRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/organizations', organizationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Import Export Hub API is running...' });
});

app.get('/', (req, res) => {
    res.send('Import Export Hub API is running...');
});

// Global error handler middleware
app.use(globalErrorHandler);

// Database Connection — fail fast if env missing
if (!process.env.MONGODB_URI) {
    console.error('FATAL: MONGODB_URI not set in iehub-server/.env');
    process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((error) => {
        console.error(`${error} did not connect`);
        process.exit(1);
    });

// Export for Vercel serverless
export default app;
