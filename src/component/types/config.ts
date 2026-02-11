/*
(1.) Type definitions for rate limiting, admin operations, and component configuration.

These types define rate limit, admin, and configuration contracts at component boundaries.
*/

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

export interface GetRateLimitOverridesArgs {
  namespace: string;
}

export interface SetRateLimitOverrideArgs {
  keyId: string;
  limit: number;
  duration: number;
}

export interface DeleteRateLimitOverrideArgs {
  keyId: string;
}

export interface PurgeExpiredKeysArgs {
  namespace: string;
  olderThan?: number;
}

export interface PurgeVerificationLogsArgs {
  olderThan: number;
}

export interface ApiKeysConfig {
  defaultNamespace?: string;
  defaultPrefix?: string;
  keyBytes?: number;
  logRetentionDays?: number;
  rollupInterval?: number;
}
