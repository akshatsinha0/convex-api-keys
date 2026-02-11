/*
(1.) Central export module for all API key management functions.
(2.) Re-exports functions from modularized files for clean component interface.
(3.) Maintains backward compatibility while organizing code into logical modules.

This module serves as the main entry point for the component, re-exporting all
functions from their respective modularized files. Functions are organized into
logical groups: key lifecycle (keys.ts), verification (verify.ts), RBAC (rbac.ts),
queries (queries.ts), analytics (analytics.ts), rate limiting (ratelimit.ts),
admin operations (admin.ts), and scheduled tasks (scheduled.ts).
*/

export { create, revoke, update, rotate } from "./functions/keys.js";
export { verify } from "./functions/verify.js";
export {
  createPermission,
  listPermissions,
  deletePermission,
  createRole,
  listRoles,
  deleteRole,
  assignRoles,
  assignPermissions,
} from "./functions/rbac.js";
export { listKeys, getKey, getKeysByOwner } from "./functions/queries.js";
export {
  getUsageStats,
  getOverallStats,
  getAuditLog,
  getVerificationLog,
} from "./functions/analytics.js";
export {
  checkRateLimit,
  setRateLimitOverride,
  deleteRateLimitOverride,
  getRateLimitOverrides,
} from "./functions/ratelimit.js";
export { purgeExpiredKeys, purgeVerificationLogs } from "./functions/admin.js";
export { expireKeys, rollupAnalytics, cleanupLogs } from "./functions/scheduled.js";
