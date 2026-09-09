import { ApiError } from '../utils/errorHandler.js';
import { PlatformRole } from '../lib/roles.js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'admin121@gmail.com,admin@importexport.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Verifies Firebase ID Token using Google OAuth2 TokenInfo endpoint.
 * Zero-dependency native implementation (uses Node 18+ global fetch).
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

        // Demo/Guest token handling in development or sandbox mode
        if (token.startsWith('guest-token-')) {
            req.user = {
                uid: token,
                email: 'guest@example.com',
                isGuest: true,
                isAdmin: false,
                platformRole: null
            };
            return next();
        }
        if (process.env.NODE_ENV !== 'production' && token === 'demo-admin-token') {
            req.user = {
                uid: 'demo-admin-uid',
                email: 'admin121@gmail.com',
                displayName: 'Demo Administrator',
                isGuest: false,
                isAdmin: true,
                platformRole: PlatformRole.SuperAdmin
            };
            return next();
        }

        // Validate token against Google TokenInfo endpoint
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return next(new ApiError(errData.error_description || 'Invalid or expired authorization token', 401));
        }

        const payload = await response.json();
        const expectedProjectId = process.env.FIREBASE_PROJECT_ID;

        // Verify audience matches our Firebase project
        if (expectedProjectId && payload.aud !== expectedProjectId) {
            return next(new ApiError('Token audience does not match this project', 401));
        }

        const email = (payload.email || '').toLowerCase();
        const isAdmin = ADMIN_EMAILS.includes(email);
        const platformRole = isAdmin ? PlatformRole.SuperAdmin : null;

        req.user = {
            uid: payload.sub || payload.user_id,
            email,
            displayName: payload.name || '',
            isAdmin,
            platformRole,
            isGuest: false
        };

        next();
    } catch (err) {
        next(new ApiError(`Authentication failed: ${err.message}`, 401));
    }
};

/**
 * Role-Based Access Control: Enforces admin authority.
 */
export const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return next(new ApiError('Administrative authority required for this operation', 403));
    }
    next();
};
