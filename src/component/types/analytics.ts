/*
(1.) Type definitions for analytics, audit, and verification log queries.
(2.) Covers usage stats, overall stats, audit entries, and verification entries.

These types define the contract for analytics and logging at component boundaries.
*/

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
  details?: Record<string, unknown>;
}

export interface VerificationEntry {
  keyHash: string;
  timestamp: number;
  success: boolean;
  code: string;
  remaining?: number;
  rateLimitRemaining?: number;
  tags?: Record<string, unknown>;
  ip?: string;
}
