/**
 * Role & Permission Engine — Wave 2 RBAC Foundation
 * 
 * Defines platform roles, org roles, trade roles, and permission checks
 * used by the `requirePermission` middleware across all writer endpoints.
 * 
 * All look‑ups are additive / nullable for migration: a user without an org
 * simply gets default "Agent" org role and "none" platform role → no writer gates
 * trigger until an org is assigned.
 */

// ---------------------------------------------------------------------------
// Platform roles — global, outside any org; typically tied to ADMIN_EMAILS or
// a `platformRole` field on the user record (added later).
// ---------------------------------------------------------------------------
export const PlatformRole = {
    SuperAdmin: 'Super Admin',
    OperationsAdmin: 'Operations Admin',
    ComplianceAdmin: 'Compliance Admin',
    FinanceAdmin: 'Finance Admin',
    SupportAdmin: 'Support Admin',
};

// ---------------------------------------------------------------------------
// Organization roles — one per membership; map to permission keys below.
// ---------------------------------------------------------------------------
export const OrgRole = {
    Owner: 'Owner',
    Admin: 'Admin',
    Manager: 'Manager',
    Agent: 'Agent',
    Viewer: 'Viewer',
};

// ---------------------------------------------------------------------------
// Trade roles — additive capabilities attached to an org membership.
// ---------------------------------------------------------------------------
export const TradeRole = {
    ProcurementManager: 'ProcurementManager',
    ProcurementAgent: 'ProcurementAgent',
    ExportManager: 'ExportManager',
    InventoryManager: 'InventoryManager',
    LogisticsCoordinator: 'LogisticsCoordinator',
    FinanceController: 'FinanceController',
    ComplianceOfficer: 'ComplianceOfficer',
};

// ---------------------------------------------------------------------------
// Platform‑role lookup (dev: ADMIN_EMAILS; prod: DB platformRole field)
// ---------------------------------------------------------------------------
export function getPlatformRole(email) {
    const admins = ['admin121@gmail.com', 'admin@importexport.com'];
    return admins.includes(email.toLowerCase()) ? PlatformRole.SuperAdmin : null;
}

// ---------------------------------------------------------------------------
// Organization‑role lookup (reads from req.membership set by resolveOrg)
// ---------------------------------------------------------------------------
export function getOrgRole(membership) {
    if (!membership) return OrgRole.Agent; // fallback for users without org
    return membership.orgRole || OrgRole.Agent;
}

// ---------------------------------------------------------------------------
// Trade‑role lookup (from membership.tradeRoles array)
// ---------------------------------------------------------------------------
export function hasTradeRole(membership, tradeRole) {
    if (!membership || !membership.tradeRoles) return false;
    return membership.tradeRoles.includes(tradeRole);
}

// ---------------------------------------------------------------------------
// Permission catalog — maps a permission key to the required role(s).
// Structure mirrors the matrix in docs/02-enterprise-architecture.md §2.4.
// ---------------------------------------------------------------------------
export const PERMISSIONS = {
    // org
    'org:members:read':          { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'org:members:write':        { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'org:member:invite':        { orgRole: [OrgRole.Owner] },
    'org:team:read':            { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'org:team:write':           { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'org:config:read':          { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'org:config:write':         { orgRole: [OrgRole.Owner] },
    'org:audit:read':           { orgRole: [OrgRole.Owner, OrgRole.Admin] },

    // marketplace
    'product:read(verified)':          { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'product:read:all':                { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'product:create':                  { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'product:update(own)':             { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager] },
    'product:delete(own)':             { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'product:verify(platform:Operations)': { platformRole: PlatformRole.OperationsAdmin },

    // orders
    'import:create':                   { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'import:read(own|inbound|global)':{ orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'import:update:own':                { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'import:status [In Transit|Delivered]': { platformRole: PlatformRole.OperationsAdmin },
    'import:status': { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'import:seller-accept|seller-reject': { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'escrow:fund':                { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'escrow:release':              { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager] },
    'escrow:reconcile':           { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager] },

    // procurement
    'rfq:create':                      { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'rfq:read(own|inbound)':          { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'rfq:counter|accept|convert':    { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },

    // disputes
    'dispute:create':                 { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager] },
    'dispute:resolve (platform:Finance)': { platformRole: PlatformRole.FinanceAdmin },

    // kyb / compliance
    'kyb:write(own)':                 { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager] },
    'kyb:approve(platform:Compliance)': { platformRole: PlatformRole.ComplianceAdmin },
    'document:read':                  { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent, OrgRole.Viewer] },
    'document:upload':                { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
    'document:delete':                { orgRole: [OrgRole.Owner, OrgRole.Admin] },
    'document:verify':                { platformRole: PlatformRole.ComplianceAdmin },

    // audit/export
    'audit:read(own|global)':         { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },

    // notify/ticket
    'notification:read(own)':         { orgRole: [OrgRole.Owner, OrgRole.Admin, OrgRole.Manager, OrgRole.Agent] },
};

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the user (identified by their resolved org membership and
 * platform role) has the requested permission key.
 */
export function hasPermission(platformRole, orgRole, tradeRoles, permissionKey) {
    // Platform SuperAdmin has universal authority across all resources
    if (platformRole === PlatformRole.SuperAdmin) return true;

    const spec = PERMISSIONS[permissionKey];
    if (!spec) return false; // unknown permission → deny

    // 1️⃣ org‑role check (if spec lists orgRole)
    if ('orgRole' in spec) {
        const allowed = spec.orgRole;
        if (!allowed.includes(orgRole)) return false;
    }

    // 2️⃣ platform‑role check (if spec lists platformRole)
    if ('platformRole' in spec) {
        if (platformRole !== spec.platformRole) return false;
    }

    // 3️⃣ trade‑role check (if spec lists tradeRole)
    if ('tradeRole' in spec) {
        if (!hasTradeRole({ tradeRoles }, spec.tradeRole)) return false;
    }

    return true;
}
