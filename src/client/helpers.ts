/*
(1.) Pure helper functions for working with API key verification results.
(2.) Permission and role checking utilities for authorization decisions.
(3.) Key status utilities for expiration, rate limiting, and revocation checks.

These functions operate purely on verification result objects and require no
database access. They provide convenient authorization decision helpers that
consuming applications can use after calling verify().
*/

import type { VerificationResult } from "./types.js";

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
