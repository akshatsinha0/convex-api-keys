/*
(1.) Type definitions for API key lifecycle operations and key metadata.
(2.) Covers create, verify, revoke, update, and rotate argument/result types.

These types define the contract for key management operations at component boundaries.
All IDs are strings for serialization across component boundaries.
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
  meta?: Record<string, unknown>;
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
  meta?: Record<string, unknown>;
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
  tags?: Record<string, unknown>;
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
  meta?: Record<string, unknown>;
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

export interface KeyInfo {
  keyId: string;
  hint: string;
  namespace: string;
  ownerId: string;
  name: string;
  meta?: Record<string, unknown>;
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
