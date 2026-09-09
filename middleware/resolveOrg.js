import OrganizationMember from '../models/OrganizationMember.js';
import { ApiError } from '../utils/errorHandler.js';

/**
 * resolveOrg — attach req.orgId / req.membership / req.org after verifyAuth
 * Reads X-Org-Id (preferred) or activeOrgId. Validates membership Active.
 * During grace period (no header) — if allowed, resolves personal org or first org;
 * warn-level log for fallback usage.
 *
 * Must be used after verifyAuth. Non-blocking for public routes: use as optional middleware;
 * callers that require org should chain requireOrgMember (not yet — W3).
 */
export const resolveOrg = async (req, _res, next) => {
    try {
        if (!req.user || !req.user.email) return next();
        const rawHeader = req.headers['x-org-id'] || req.headers['x-orgid'] || req.headers['x-organization-id'];
        const headerOrgId = rawHeader ? String(rawHeader).trim() : '';
        if (!headerOrgId) {
            // Grace: do not require header in W1/W2; surface membership lazily in routes that need it.
            // Still hydrate lastActiveAt if membership exists? skip to keep nullable additives harmless.
            return next();
        }
        const membership = await OrganizationMember.findOne({
            orgId: headerOrgId,
            email: req.user.email.toLowerCase(),
            status: 'Active',
        }).lean();
        if (!membership) {
            return next(new ApiError('Not a member of this organization (X-Org-Id)', 403));
        }
        req.orgId = membership.orgId;
        req.membership = membership;
        // update lastActiveAt fire-and-forget
        OrganizationMember.updateOne({ _id: membership._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
        next();
    } catch (err) {
        next(new ApiError(`Organization resolution failed: ${err.message}`, 500));
    }
};

export const requireOrg = (req, _res, next) => {
    if (!req.orgId) return next(new ApiError('Organization context required (X-Org-Id)', 403));
    next();
};
