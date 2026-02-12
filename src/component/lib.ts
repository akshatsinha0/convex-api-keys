/*
(1.) Central export module for all API key management functions.
(2.) Re-exports functions from modularized files for clean component interface.
(3.) Maintains backward compatibility while organizing code into logical modules.

This module serves as the main entry point for the component, re-exporting all
functions from their respective modularized files. Functions are organized into
logical groups: key lifecycle, key management, verification, RBAC entities,
RBAC assignments, queries, analytics, rate limiting, admin, and scheduled tasks.
*/

export { create, revoke } from "./functions/keys/lifecycle.js";
export { update, rotate } from "./functions/keys/management.js";
export { importKey, logExternalVerification } from "./functions/keys/import.js";
export { verify } from "./functions/verify.js";
export {
  createPermission,
  listPermissions,
  deletePermission,
} from "./functions/rbac/permissions.js";
export {
  createRole,
  listRoles,
  deleteRole,
} from "./functions/rbac/roles.js";
export { assignRoles, assignPermissions } from "./functions/rbac/assignments.js";
export { listKeys, getKey, getKeysByOwner } from "./functions/queries.js";
export {
  getUsageStats,
  getUsageByOwner,
  getTopKeysByUsage,
  getVerificationsOverTime,
} from "./functions/analytics/usage.js";
export { getOverallStats } from "./functions/analytics/overview.js";
export {
  getAuditLog,
  getVerificationLog,
} from "./functions/analytics/logs.js";
export {
  checkRateLimit,
  setRateLimitOverride,
  deleteRateLimitOverride,
  setOwnerRateLimit,
  deleteOwnerRateLimit,
  getRateLimitOverrides,
} from "./functions/ratelimit.js";
export { purgeExpiredKeys, purgeVerificationLogs } from "./functions/admin.js";
export { expireKeys, cleanupLogs } from "./functions/scheduled/maintenance.js";
export { rollupAnalytics, rollupDaily } from "./functions/scheduled/rollup.js";
