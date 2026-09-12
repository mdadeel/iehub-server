import OrganizationMember from '../models/OrganizationMember.js';
import { ApiError } from '../utils/errorHandler.js';

/**
 * resolveOrg — attaches req.orgId and req.membership after verifyAuth.
 * 1. Reads X-Org-Id header.
 * 2. Validates that the authenticated user is an Active member of that organization.
 * 3. If header is omitted, falls back to the user's primary/first active organization membership.
 */
export const resolveOrg = async (req, _res, next) => {
    try {
        if (!req.user || !req.user.email) return next();

        const rawHeader = req.headers['x-org-id'] || req.headers['x-orgid'] || req.headers['x-organization-id'];
        const headerOrgId = rawHeader ? String(rawHeader).trim() : '';

        if (headerOrgId) {
            const membership = await OrganizationMember.findOne({
                orgId: headerOrgId,
                email: req.user.email.toLowerCase(),
                status: 'Active',
            }).lean();

            if (!membership && !req.user.isAdmin) {
                return next(new ApiError('Not an active member of the specified organization (X-Org-Id)', 403));
            }

            if (membership) {
                req.orgId = membership.orgId;
                req.membership = membership;
                // update lastActiveAt fire-and-forget
                OrganizationMember.updateOne({ _id: membership._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
            } else if (req.user.isAdmin) {
                // Platform admin operating in tenant context for support/audit
                req.orgId = headerOrgId;
                req.membership = {
                    orgId: headerOrgId,
                    orgRole: 'Admin',
                    tradeRoles: ['ProcurementManager', 'ExportManager', 'FinanceController', 'InventoryManager'],
                };
            }
            return next();
        }

        // Automatic fallback: resolve user's primary active organization
        const defaultMembership = await OrganizationMember.findOne({
            email: req.user.email.toLowerCase(),
            status: 'Active',
        }).sort({ createdAt: 1 }).lean();

        if (defaultMembership) {
            req.orgId = defaultMembership.orgId;
            req.membership = defaultMembership;
        }

        next();
    } catch (err) {
        next(new ApiError(`Organization resolution failed: ${err.message}`, 500));
    }
};

/**
 * Enforces that an organization context must be resolved before proceeding.
 */
export const requireOrg = (req, _res, next) => {
    if (!req.orgId) {
        return next(new ApiError('Active organization context required. Please select or join an organization.', 403));
    }
    next();
};

export default { resolveOrg, requireOrg };
