import { describe, expect, test } from "vitest";
import {
  ApiKeys,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  isRateLimited,
  isExpired,
  isRevoked,
  formatKeyHint,
  calculateExpiration,
  isKeyExpiringSoon,
} from "./index.js";
import type { VerificationResult } from "./types.js";

describe("client helpers", () => {
  const validResult: VerificationResult = {
    valid: true,
    code: "VALID",
    keyId: "key1",
    ownerId: "owner1",
    permissions: ["read:data", "write:data"],
    roles: ["admin", "editor"],
  };

  const rateLimitedResult: VerificationResult = {
    valid: false,
    code: "RATE_LIMITED",
    permissions: [],
    roles: [],
  };

  const expiredResult: VerificationResult = {
    valid: false,
    code: "EXPIRED",
    permissions: [],
    roles: [],
  };

  const revokedResult: VerificationResult = {
    valid: false,
    code: "REVOKED",
    permissions: [],
    roles: [],
  };

  test("hasPermission", () => {
    expect(hasPermission(validResult, "read:data")).toBe(true);
    expect(hasPermission(validResult, "delete:data")).toBe(false);
  });

  test("hasAnyPermission", () => {
    expect(hasAnyPermission(validResult, ["read:data", "delete:data"])).toBe(true);
    expect(hasAnyPermission(validResult, ["delete:data", "admin:all"])).toBe(false);
  });

  test("hasAllPermissions", () => {
    expect(hasAllPermissions(validResult, ["read:data", "write:data"])).toBe(true);
    expect(hasAllPermissions(validResult, ["read:data", "delete:data"])).toBe(false);
  });

  test("hasRole", () => {
    expect(hasRole(validResult, "admin")).toBe(true);
    expect(hasRole(validResult, "viewer")).toBe(false);
  });

  test("isRateLimited", () => {
    expect(isRateLimited(rateLimitedResult)).toBe(true);
    expect(isRateLimited(validResult)).toBe(false);
  });

  test("isExpired", () => {
    expect(isExpired(expiredResult)).toBe(true);
    expect(isExpired(validResult)).toBe(false);
  });

  test("isRevoked", () => {
    expect(isRevoked(revokedResult)).toBe(true);
    expect(isRevoked(validResult)).toBe(false);
  });

  test("formatKeyHint", () => {
    expect(formatKeyHint("sk_abc123456789xyz")).toContain("...");
    expect(formatKeyHint("short")).toBe("short");
  });

  test("calculateExpiration", () => {
    const now = Date.now();
    const expiry = calculateExpiration(30);
    expect(expiry).toBeGreaterThan(now);
    expect(expiry).toBeLessThanOrEqual(now + 30 * 24 * 60 * 60 * 1000 + 100);
  });

  test("isKeyExpiringSoon", () => {
    const soonExpiry = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const farExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(isKeyExpiringSoon(soonExpiry, 7)).toBe(true);
    expect(isKeyExpiringSoon(farExpiry, 7)).toBe(false);
    expect(isKeyExpiringSoon(undefined)).toBe(false);
  });
});

describe("ApiKeys class", () => {
  test("can be instantiated", () => {
    const mockComponent = {} as any;
    const apiKeys = new ApiKeys(mockComponent, {
      defaultNamespace: "test",
      defaultPrefix: "tk_",
    });
    expect(apiKeys).toBeDefined();
    expect(apiKeys.component).toBe(mockComponent);
  });
});
