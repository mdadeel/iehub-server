import { ApiError } from '../utils/errorHandler.js';
import { PlatformRole } from '../lib/roles.js';
import { verifyFirebaseIdToken } from '../lib/firebaseAdmin.js';
import logger from '../utils/logger.js';

export function getAdminEmails() {
    return (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Enterprise Authentication Middleware
 * 1. Checks Bearer token.
 * 2. Strictly gates development sandbox bypass tokens.
 * 3. Verifies token via Firebase Admin SDK / Google verification.
 * 4. Checks admin authority against configured ADMIN_EMAILS (no hardcoded fallbacks).
 */
export const verifyAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new ApiError('Authorization token required (Bearer <token>)', 401));
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return next(new ApiError('Malformed authorization header', 401));
        }

        const isProd = process.env.NODE_ENV === 'production';
        const isSandboxAllowed = !isProd && process.env.ENABLE_DEV_SANDBOX === 'true';

        // Check for synthetic development tokens
        if (token.startsWith('guest-token-') || token === 'demo-admin-token') {
            if (!isSandboxAllowed) {
                logger.warn('Sandbox token rejected: sandbox mode disabled in this environment', {
                    tokenPrefix: token.slice(0, 12),
                    nodeEnv: process.env.NODE_ENV,
                    correlationId: req.correlationId,
                });
                return next(new ApiError('Development authentication bypass is disabled in this environment', 401));
            }

            // Sandbox explicitly enabled in local development
            if (token === 'demo-admin-token') {
                const adminEmails = getAdminEmails();
                const adminEmail = adminEmails[0] || 'dev-admin@importexport.local';
                req.user = {
                    uid: 'demo-admin-uid',
                    email: adminEmail,
                    displayName: 'Demo Administrator (Dev Sandbox)',
                    isGuest: false,
                    isAdmin: true,
                    platformRole: PlatformRole.SuperAdmin,
                };
                logger.debug('Authenticated via dev sandbox admin token', { correlationId: req.correlationId });
                return next();
            }

            req.user = {
                uid: token,
                email: 'guest@importexport.local',
                displayName: 'Guest User (Dev Sandbox)',
                isGuest: true,
                isAdmin: false,
                platformRole: null,
            };
            logger.debug('Authenticated via dev sandbox guest token', { correlationId: req.correlationId });
            return next();
        }

        // Verify Firebase ID token cryptographically
        const decoded = await verifyFirebaseIdToken(token);
        const adminEmails = getAdminEmails();
        const isAdmin = adminEmails.includes(decoded.email);
        const platformRole = isAdmin ? PlatformRole.SuperAdmin : null;

        req.user = {
            uid: decoded.uid,
            email: decoded.email,
            displayName: decoded.displayName || '',
            isAdmin,
            platformRole,
            isGuest: false,
        };

        next();
    } catch (err) {
        logger.warn('Authentication token verification failed', {
            error: err.message,
            correlationId: req.correlationId,
        });
        next(new ApiError(`Authentication failed: ${err.message}`, 401));
    }
};

/**
 * Role-Based Access Control: Enforces platform admin authority.
 */
export const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        logger.warn('Unauthorized administrative access attempt', {
            userEmail: req.user?.email || 'unauthenticated',
            correlationId: req.correlationId,
        });
        return next(new ApiError('Administrative authority required for this operation', 403));
    }
    next();
};

export default { verifyAuth, requireAdmin };
