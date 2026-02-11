/*
(1.) Type definitions for API key management component covering all public interfaces and internal structures.
(2.) Verification result types include detailed outcome codes for different failure scenarios.
(3.) Rate limit types support both per-key and per-owner (shared) rate limiting configurations.
(4.) RBAC types define permission and role structures with hierarchical relationships.
(5.) Analytics types provide structured data for usage tracking and reporting.

These types define the contract between the component and consuming applications. All types
are designed to be serializable across component boundaries, using string IDs instead of
Convex Id types. The verification result type is comprehensive, returning all necessary
information for authorization decisions without requiring additional database queries. Rate
limit types support both fixed and sliding window algorithms. The outcome code enum provides
clear, actionable feedback for verification failures, enabling proper error handling and
user messaging in consuming applications.
*/

export type OutcomeCode =
  | "VALID"
  | "REVOKED"
  | "EXPIRED"
  | "RATE_LIMITED"
  | "USAGE_EXCEEDED"
  | "DISABLED"
  | "NOT_FOUND"
  | "ROTATION_GRACE_EXPIRED";

export interface VerificationResult {
  valid: boolean;
  code: OutcomeCode;
  keyId?: string;
  ownerId?: string;
  meta?: any;
  remaining?: number;
  ratelimit?: {
    remaining: number;
    reset: number;
  };
  permissions: string[];
  roles: string[];
  message?: string;
}

export interface CreateKeyArgs {
  ownerId: string;
  name?: string;
  meta?: any;
  prefix?: string;
  expires?: number;
  remaining?: number;
  refill?: {
    amount: number;
    interval: "hourly" | "daily" | "weekly" | "monthly";
  };
  ratelimit?: {
    limit: number;
    duration: number;
  };
  roles?: string[];
  permissions?: string[];
  environment?: string;
  namespace?: string;
}

export interface CreateKeyResult {
  key: string;
  keyId: string;
}

export interface VerifyKeyArgs {
  key: string;
  tags?: any;
  ip?: string;
  namespace?: string;
}

export interface RevokeKeyArgs {
  keyId: string;
  soft?: boolean;
}

export interface UpdateKeyArgs {
  keyId: string;
  name?: string;
  meta?: any;
  expires?: number | null;
  remaining?: number;
  ratelimit?: {
    limit: number;
    duration: number;
  };
  enabled?: boolean;
}

export interface RotateKeyArgs {
  keyId: string;
  gracePeriodMs?: number;
}

export interface CheckRateLimitArgs {
  identifier: string;
  namespace: string;
  limit: number;
  duration: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export interface CreatePermissionArgs {
  name: string;
  description?: string;
}

export interface CreateRoleArgs {
  name: string;
  description?: string;
  permissions: string[];
}

export interface AssignRolesArgs {
  keyId: string;
  roles: string[];
}

export interface AssignPermissionsArgs {
  keyId: string;
  permissions: string[];
}

export interface ListKeysArgs {
  namespace?: string;
  ownerId?: string;
  cursor?: string;
  limit?: number;
}

export interface GetKeyArgs {
  keyId: string;
}

export interface GetKeysByOwnerArgs {
  ownerId: string;
}

export interface GetUsageStatsArgs {
  keyId: string;
  period?: "hour" | "day";
}

export interface GetUsageByOwnerArgs {
  ownerId: string;
  period?: "hour" | "day";
}

export interface GetOverallStatsArgs {
  namespace: string;
}

export interface GetAuditLogArgs {
  keyId?: string;
  actorId?: string;
  limit?: number;
}

export interface GetVerificationLogArgs {
  keyId: string;
  limit?: number;
  since?: number;
}

export interface GetRateLimitOverridesArgs {
  namespace: string;
}

export interface PurgeExpiredKeysArgs {
  namespace: string;
  olderThan?: number;
}

export interface PurgeVerificationLogsArgs {
  olderThan: number;
}

export interface SetRateLimitOverrideArgs {
  keyId: string;
  limit: number;
  duration: number;
}

export interface DeleteRateLimitOverrideArgs {
  keyId: string;
}

export interface UsageStats {
  total: number;
  valid: number;
  rateLimited: number;
  usageExceeded: number;
  expired: number;
  revoked: number;
  disabled: number;
  notFound: number;
}

export interface OverviewStats {
  totalKeys: number;
  activeKeys: number;
  disabledKeys: number;
  expiredKeys: number;
  revokedKeys: number;
  totalVerifications: number;
  successRate: number;
}

export interface AuditEntry {
  action: string;
  actorId?: string;
  targetKeyHash?: string;
  timestamp: number;
  details?: any;
}

export interface VerificationEntry {
  keyHash: string;
  timestamp: number;
  success: boolean;
  code: string;
  remaining?: number;
  rateLimitRemaining?: number;
  tags?: any;
  ip?: string;
}

export interface KeyInfo {
  keyId: string;
  hint: string;
  namespace: string;
  ownerId: string;
  name: string;
  meta?: any;
  createdAt: number;
  updatedAt: number;
  expires?: number;
  remaining?: number;
  enabled: boolean;
  revokedAt?: number;
  environment?: string;
  permissions: string[];
  roles: string[];
}

export interface ApiKeysConfig {
  defaultNamespace?: string;
  defaultPrefix?: string;
  keyBytes?: number;
  logRetentionDays?: number;
  rollupInterval?: number;
}
