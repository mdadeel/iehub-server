/**
 * Permission catalog & helpers — re‑exports from `lib/roles.js` so the
 * middleware can depend on a single entry‑point.
 */
import { PERMISSIONS, hasPermission, PlatformRole, OrgRole, TradeRole } from '../lib/roles.js';

export { PERMISSIONS, hasPermission, PlatformRole, OrgRole, TradeRole };