import logger from '../utils/logger.js';

/**
 * Validates environment variables at boot time.
 * Throws a fatal error if essential production variables are missing.
 */
export function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';
    const missing = [];

    if (!process.env.MONGODB_URI) {
        missing.push('MONGODB_URI');
    }

    if (isProd) {
        // Production safety checks
        if (process.env.ENABLE_DEV_SANDBOX === 'true') {
            logger.warn('SECURITY WARNING: ENABLE_DEV_SANDBOX is enabled in production! This should be disabled.');
        }

        if (!process.env.ADMIN_EMAILS) {
            logger.warn('SECURITY WARNING: ADMIN_EMAILS not set in production. No platform administrators configured.');
        }
    }

    if (missing.length > 0) {
        const errorMsg = `FATAL CONFIGURATION ERROR: Missing required environment variables: ${missing.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
    }

    logger.info('Environment configuration validated successfully', {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 5000,
        sandboxEnabled: process.env.ENABLE_DEV_SANDBOX === 'true',
    });
}

export default validateEnv;
