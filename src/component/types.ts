/*
(1.) Central re-export module for all API key component type definitions.
(2.) Types are organized into logical sub-modules: keys, rbac, analytics, config.

This module re-exports all types from sub-modules for backward compatibility and
convenience. Consuming code can import from this file or directly from sub-modules.
*/

export type {
  OutcomeCode,
  VerificationResult,
  CreateKeyArgs,
  CreateKeyResult,
  VerifyKeyArgs,
  RevokeKeyArgs,
  UpdateKeyArgs,
  RotateKeyArgs,
  KeyInfo,
} from "./types/keys.js";

export type {
  CreatePermissionArgs,
  CreateRoleArgs,
  AssignRolesArgs,
  AssignPermissionsArgs,
} from "./types/rbac.js";

export type {
  ListKeysArgs,
  GetKeyArgs,
  GetKeysByOwnerArgs,
  GetUsageStatsArgs,
  GetUsageByOwnerArgs,
  GetOverallStatsArgs,
  GetAuditLogArgs,
  GetVerificationLogArgs,
  UsageStats,
  OverviewStats,
  AuditEntry,
  VerificationEntry,
} from "./types/analytics.js";

export type {
  CheckRateLimitArgs,
  RateLimitResult,
  GetRateLimitOverridesArgs,
  SetRateLimitOverrideArgs,
  DeleteRateLimitOverrideArgs,
  PurgeExpiredKeysArgs,
  PurgeVerificationLogsArgs,
  ApiKeysConfig,
} from "./types/config.js";
