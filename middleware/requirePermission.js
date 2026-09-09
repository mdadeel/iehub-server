import { ApiError } from '../utils/errorHandler.js';
import { hasPermission } from '../utils/permissions.js';

/**
 * Permission gate — checks the resolved org membership and platform role.
 * Must be used after `resolveOrg` so `req.membership` is populated.
 */
export function requirePermission(permissionKey) {
    return (req, res, next) => {
        const membership = req.membership || null;
        const orgRole = membership?.orgRole || 'Agent';
        const platformRole = req.user?.platformRole || null;
        const tradeRoles = membership?.tradeRoles || [];

        if (!hasPermission(platformRole, orgRole, tradeRoles, permissionKey)) {
            return next(new ApiError(`Permission denied: ${permissionKey}`, 403));
        }
        next();
    };
}

export function requirePlatformRole(role) {
    return (req, res, next) => {
        if (req.user?.platformRole !== role) {
            return next(new ApiError(`Platform role required: ${role}`, 403));
        }
        next();
    };
}

export function requireOrgRole(role) {
    return (req, res, next) => {
        const orgRole = req.membership?.orgRole || 'Agent';
        if (orgRole !== role) {
            return next(new ApiError(`Organization role required: ${role}`, 403));
        }
        next();
    };
}

export function requireTradeRole(role) {
    return (req, res, next) => {
        const tradeRoles = req.membership?.tradeRoles || [];
        if (!tradeRoles.includes(role)) {
            return next(new ApiError(`Trade role required: ${role}`, 403));
        }
        next();
    };
}
