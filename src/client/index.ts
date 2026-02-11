/*
(1.) Client SDK utilities and helper functions for API key management.
(2.) Provides type-safe wrappers and utility functions for component usage.
(3.) Designed to work with any Convex component instance without requiring generated types.

This module provides utility functions and helpers for working with the API keys
component. The hasPermission helper checks if a verification result contains a
specific permission. Additional utilities can be added here for common operations
like formatting key hints, calculating expiration times, etc.
*/

export interface VerificationResult {
  valid: boolean;
  code: string;
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

export interface CreateKeyResult {
  key: string;
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

export interface OverallStats {
  totalKeys: number;
  activeKeys: number;
  disabledKeys: number;
  expiredKeys: number;
  revokedKeys: number;
  totalVerifications: number;
  successRate: number;
}

export function hasPermission(
  verifyResult: VerificationResult,
  permission: string
): boolean {
  return verifyResult.permissions?.includes(permission) || false;
}

export function hasAnyPermission(
  verifyResult: VerificationResult,
  permissions: string[]
): boolean {
  return permissions.some(p => verifyResult.permissions?.includes(p));
}

export function hasAllPermissions(
  verifyResult: VerificationResult,
  permissions: string[]
): boolean {
  return permissions.every(p => verifyResult.permissions?.includes(p));
}

export function hasRole(
  verifyResult: VerificationResult,
  role: string
): boolean {
  return verifyResult.roles?.includes(role) || false;
}

export function isRateLimited(verifyResult: VerificationResult): boolean {
  return verifyResult.code === "RATE_LIMITED";
}

export function isExpired(verifyResult: VerificationResult): boolean {
  return verifyResult.code === "EXPIRED";
}

export function isRevoked(verifyResult: VerificationResult): boolean {
  return verifyResult.code === "REVOKED";
}

export function formatKeyHint(key: string): string {
  if (key.length < 12) return key;
  const prefix = key.substring(0, key.indexOf("_") + 1);
  const suffix = key.substring(key.length - 4);
  return `${prefix}...${suffix}`;
}

export function calculateExpiration(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

export function isKeyExpiringSoon(
  expiresAt: number | undefined,
  daysThreshold: number = 7
): boolean {
  if (!expiresAt) return false;
  const threshold = Date.now() + daysThreshold * 24 * 60 * 60 * 1000;
  return expiresAt < threshold;
}
