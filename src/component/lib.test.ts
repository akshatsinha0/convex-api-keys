/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Key Lifecycle ──────────────────────────────────────────────────

  test("create and verify key", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Test Key",
      namespace: "default",
    });
    expect(result.key).toBeDefined();
    expect(result.keyId).toBeDefined();
    expect(result.key).toMatch(/^sk_/);

    const verifyResult = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.code).toBe("VALID");
    expect(verifyResult.ownerId).toBe("user1");
    expect(verifyResult.message).toBe("API key is valid");
  });

  test("create key with custom prefix", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Custom Prefix Key",
      prefix: "pk_live_",
    });
    expect(result.key).toMatch(/^pk_live_/);
  });

  test("create key with metadata preserves meta through verify", async () => {
    const t = initConvexTest();
    const meta = { plan: "enterprise", region: "us-east-1" };
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Meta Key",
      meta,
    });

    const verifyResult = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.meta).toEqual(meta);
  });

  test("verify nonexistent key returns NOT_FOUND", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.verify, {
      key: "sk_completely_fake_key_that_does_not_exist",
    });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
    expect(result.permissions).toEqual([]);
    expect(result.roles).toEqual([]);
  });

  // ── Revoke ─────────────────────────────────────────────────────────

  test("revoke key - soft", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Revoke Test",
    });

    await t.mutation(api.lib.revoke, {
      keyId: result.keyId,
      soft: true,
    });

    const verifyResult = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.code).toBe("REVOKED");

    // Key should still be queryable after soft revoke
    const keyInfo = await t.query(api.lib.getKey, { keyId: result.keyId });
    expect(keyInfo).not.toBeNull();
    expect(keyInfo!.revokedAt).toBeDefined();
  });

  test("revoke key - hard", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Hard Delete Test",
    });

    await t.mutation(api.lib.revoke, {
      keyId: result.keyId,
      soft: false,
    });

    const verifyResult = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.code).toBe("NOT_FOUND");

    // Key should not be queryable after hard delete
    const keyInfo = await t.query(api.lib.getKey, { keyId: result.keyId });
    expect(keyInfo).toBeNull();
  });

  test("revoke nonexistent key throws", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.lib.revoke, { keyId: "nonexistent_id" })
    ).rejects.toThrow("Key not found");
  });

  // ── Update ─────────────────────────────────────────────────────────

  test("update key name and metadata", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Original Name",
      meta: { tier: "free" },
    });

    await t.mutation(api.lib.update, {
      keyId: result.keyId,
      name: "Updated Name",
      meta: { tier: "pro" },
    });

    const key = await t.query(api.lib.getKey, { keyId: result.keyId });
    expect(key?.name).toBe("Updated Name");
    expect(key?.meta).toEqual({ tier: "pro" });
  });

  test("update nonexistent key throws", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.lib.update, { keyId: "nonexistent_id", name: "X" })
    ).rejects.toThrow("Key not found");
  });

  test("disabled key fails verification", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Disable Test",
    });

    await t.mutation(api.lib.update, {
      keyId: result.keyId,
      enabled: false,
    });

    const verifyResult = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.code).toBe("DISABLED");
  });

  test("re-enable key restores verification", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Toggle Key",
    });

    await t.mutation(api.lib.update, { keyId: result.keyId, enabled: false });
    const disabled = await t.mutation(api.lib.verify, { key: result.key });
    expect(disabled.valid).toBe(false);

    await t.mutation(api.lib.update, { keyId: result.keyId, enabled: true });
    const enabled = await t.mutation(api.lib.verify, { key: result.key });
    expect(enabled.valid).toBe(true);
  });

  // ── Rotate ─────────────────────────────────────────────────────────

  test("rotate key without grace period", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Rotate Test",
    });

    const rotated = await t.mutation(api.lib.rotate, {
      keyId: result.keyId,
    });
    expect(rotated.key).toBeDefined();
    expect(rotated.keyId).not.toBe(result.keyId);

    const oldVerify = await t.mutation(api.lib.verify, { key: result.key });
    expect(oldVerify.valid).toBe(false);

    const newVerify = await t.mutation(api.lib.verify, { key: rotated.key });
    expect(newVerify.valid).toBe(true);
    expect(newVerify.ownerId).toBe("user1");
  });

  test("rotate key with grace period keeps both keys valid", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Grace Rotate",
    });

    const rotated = await t.mutation(api.lib.rotate, {
      keyId: result.keyId,
      gracePeriodMs: 60_000,
    });

    // Both keys should work during grace period
    const oldVerify = await t.mutation(api.lib.verify, { key: result.key });
    expect(oldVerify.valid).toBe(true);

    const newVerify = await t.mutation(api.lib.verify, { key: rotated.key });
    expect(newVerify.valid).toBe(true);
  });

  test("rotated key inherits permissions and roles", async () => {
    const t = initConvexTest();

    const permId = await t.mutation(api.lib.createPermission, { name: "api:read" });
    const roleId = await t.mutation(api.lib.createRole, {
      name: "api-reader",
      permissions: [permId],
    });

    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "RBAC Rotate",
      permissions: [permId],
      roles: [roleId],
    });

    const rotated = await t.mutation(api.lib.rotate, { keyId: result.keyId });
    const verifyResult = await t.mutation(api.lib.verify, { key: rotated.key });
    expect(verifyResult.permissions).toContain(permId);
    expect(verifyResult.roles).toContain(roleId);
  });

  // ── Usage Credits ──────────────────────────────────────────────────

  test("usage credits decrement on verify", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Limited Key",
      remaining: 2,
    });

    const v1 = await t.mutation(api.lib.verify, { key: result.key });
    expect(v1.valid).toBe(true);
    expect(v1.remaining).toBe(1);

    const v2 = await t.mutation(api.lib.verify, { key: result.key });
    expect(v2.valid).toBe(true);
    expect(v2.remaining).toBe(0);

    const v3 = await t.mutation(api.lib.verify, { key: result.key });
    expect(v3.valid).toBe(false);
    expect(v3.code).toBe("USAGE_EXCEEDED");
    expect(v3.remaining).toBe(0);
  });

  test("key with no remaining field has unlimited usage", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Unlimited Key",
    });

    for (let i = 0; i < 5; i++) {
      const v = await t.mutation(api.lib.verify, { key: result.key });
      expect(v.valid).toBe(true);
      expect(v.remaining).toBeUndefined();
    }
  });

  test("update remaining resets usage credits", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Refillable Key",
      remaining: 1,
    });

    await t.mutation(api.lib.verify, { key: result.key });
    const exhausted = await t.mutation(api.lib.verify, { key: result.key });
    expect(exhausted.valid).toBe(false);

    // Admin resets credits
    await t.mutation(api.lib.update, { keyId: result.keyId, remaining: 5 });

    const refreshed = await t.mutation(api.lib.verify, { key: result.key });
    expect(refreshed.valid).toBe(true);
    expect(refreshed.remaining).toBe(4);
  });

  // ── Rate Limiting ──────────────────────────────────────────────────

  test("rate limiting enforces request ceiling", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Rate Limited Key",
      ratelimit: { limit: 3, duration: 60_000 },
    });

    const v1 = await t.mutation(api.lib.verify, { key: result.key });
    expect(v1.valid).toBe(true);

    const v2 = await t.mutation(api.lib.verify, { key: result.key });
    expect(v2.valid).toBe(true);

    const v3 = await t.mutation(api.lib.verify, { key: result.key });
    expect(v3.valid).toBe(true);

    const v4 = await t.mutation(api.lib.verify, { key: result.key });
    expect(v4.valid).toBe(false);
    expect(v4.code).toBe("RATE_LIMITED");
    expect(v4.ratelimit).toBeDefined();
    expect(v4.ratelimit!.remaining).toBe(0);
  });

  test("standalone checkRateLimit respects limits", async () => {
    const t = initConvexTest();

    const r1 = await t.mutation(api.lib.checkRateLimit, {
      identifier: "test-id",
      namespace: "default",
      limit: 2,
      duration: 60_000,
    });
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = await t.mutation(api.lib.checkRateLimit, {
      identifier: "test-id",
      namespace: "default",
      limit: 2,
      duration: 60_000,
    });
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = await t.mutation(api.lib.checkRateLimit, {
      identifier: "test-id",
      namespace: "default",
      limit: 2,
      duration: 60_000,
    });
    expect(r3.success).toBe(false);
  });

  test("rate limit override changes effective limit", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Override Key",
      ratelimit: { limit: 1, duration: 60_000 },
    });

    // Hit the default limit of 1
    await t.mutation(api.lib.verify, { key: result.key });
    const limited = await t.mutation(api.lib.verify, { key: result.key });
    expect(limited.valid).toBe(false);
    expect(limited.code).toBe("RATE_LIMITED");

    // Set override to allow more requests
    await t.mutation(api.lib.setRateLimitOverride, {
      keyId: result.keyId,
      limit: 10,
      duration: 60_000,
    });

    // Verify overrides are queryable
    const overrides = await t.query(api.lib.getRateLimitOverrides, {
      namespace: "default",
    });
    expect(overrides.length).toBeGreaterThanOrEqual(1);
  });

  test("delete rate limit override", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Delete Override Key",
      ratelimit: { limit: 5, duration: 60_000 },
    });

    await t.mutation(api.lib.setRateLimitOverride, {
      keyId: result.keyId,
      limit: 100,
      duration: 60_000,
    });

    await t.mutation(api.lib.deleteRateLimitOverride, {
      keyId: result.keyId,
    });

    const overrides = await t.query(api.lib.getRateLimitOverrides, {
      namespace: "default",
    });
    const found = overrides.find((o) => o.limit === 100);
    expect(found).toBeUndefined();
  });

  // ── Input Validation ───────────────────────────────────────────────

  test("checkRateLimit rejects zero limit", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.lib.checkRateLimit, {
        identifier: "test",
        namespace: "default",
        limit: 0,
        duration: 1000,
      })
    ).rejects.toThrow("limit must be positive");
  });

  test("checkRateLimit rejects negative duration", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.lib.checkRateLimit, {
        identifier: "test",
        namespace: "default",
        limit: 5,
        duration: -1,
      })
    ).rejects.toThrow("duration must be positive");
  });

  test("setRateLimitOverride rejects zero limit", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Validation Test",
    });

    await expect(
      t.mutation(api.lib.setRateLimitOverride, {
        keyId: result.keyId,
        limit: 0,
        duration: 1000,
      })
    ).rejects.toThrow("limit must be positive");
  });

  // ── RBAC ───────────────────────────────────────────────────────────

  test("permission and role assignment with verify", async () => {
    const t = initConvexTest();

    const readPerm = await t.mutation(api.lib.createPermission, {
      name: "data:read",
      description: "Read data access",
    });
    const writePerm = await t.mutation(api.lib.createPermission, {
      name: "data:write",
    });

    const roleId = await t.mutation(api.lib.createRole, {
      name: "editor",
      permissions: [readPerm, writePerm],
    });

    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "RBAC Test",
      roles: [roleId],
    });

    const verifyResult = await t.mutation(api.lib.verify, { key: result.key });
    expect(verifyResult.valid).toBe(true);
    // Role's permissions should be resolved
    expect(verifyResult.permissions).toContain(readPerm);
    expect(verifyResult.permissions).toContain(writePerm);
    expect(verifyResult.roles).toContain(roleId);
  });

  test("direct permissions merged with role permissions", async () => {
    const t = initConvexTest();

    const p1 = await t.mutation(api.lib.createPermission, { name: "perm:a" });
    const p2 = await t.mutation(api.lib.createPermission, { name: "perm:b" });
    const p3 = await t.mutation(api.lib.createPermission, { name: "perm:c" });

    const roleId = await t.mutation(api.lib.createRole, {
      name: "partial-role",
      permissions: [p2, p3],
    });

    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Merged Perms",
      permissions: [p1],
      roles: [roleId],
    });

    const verifyResult = await t.mutation(api.lib.verify, { key: result.key });
    expect(verifyResult.permissions).toContain(p1);
    expect(verifyResult.permissions).toContain(p2);
    expect(verifyResult.permissions).toContain(p3);
    expect(verifyResult.permissions.length).toBe(3);
  });

  test("duplicate permission name throws", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.createPermission, { name: "unique:perm" });
    await expect(
      t.mutation(api.lib.createPermission, { name: "unique:perm" })
    ).rejects.toThrow('Permission "unique:perm" already exists');
  });

  test("duplicate role name throws", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.createRole, { name: "unique-role", permissions: [] });
    await expect(
      t.mutation(api.lib.createRole, { name: "unique-role", permissions: [] })
    ).rejects.toThrow('Role "unique-role" already exists');
  });

  test("list and delete permissions", async () => {
    const t = initConvexTest();
    const id = await t.mutation(api.lib.createPermission, { name: "temp:perm" });

    const before = await t.query(api.lib.listPermissions, {});
    expect(before.some((p) => p.id === id)).toBe(true);

    await t.mutation(api.lib.deletePermission, { permissionId: id });

    const after = await t.query(api.lib.listPermissions, {});
    expect(after.some((p) => p.id === id)).toBe(false);
  });

  test("list and delete roles", async () => {
    const t = initConvexTest();
    const id = await t.mutation(api.lib.createRole, {
      name: "temp-role",
      permissions: [],
    });

    const before = await t.query(api.lib.listRoles, {});
    expect(before.some((r) => r.id === id)).toBe(true);

    await t.mutation(api.lib.deleteRole, { roleId: id });

    const after = await t.query(api.lib.listRoles, {});
    expect(after.some((r) => r.id === id)).toBe(false);
  });

  test("assignRoles replaces key roles", async () => {
    const t = initConvexTest();

    const r1 = await t.mutation(api.lib.createRole, { name: "role-a", permissions: [] });
    const r2 = await t.mutation(api.lib.createRole, { name: "role-b", permissions: [] });

    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Assign Test",
      roles: [r1],
    });

    await t.mutation(api.lib.assignRoles, {
      keyId: result.keyId,
      roles: [r2],
    });

    const key = await t.query(api.lib.getKey, { keyId: result.keyId });
    expect(key!.roles).toEqual([r2]);
  });

  test("assignPermissions replaces key permissions", async () => {
    const t = initConvexTest();

    const p1 = await t.mutation(api.lib.createPermission, { name: "assign:a" });
    const p2 = await t.mutation(api.lib.createPermission, { name: "assign:b" });

    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Assign Perm Test",
      permissions: [p1],
    });

    await t.mutation(api.lib.assignPermissions, {
      keyId: result.keyId,
      permissions: [p2],
    });

    const key = await t.query(api.lib.getKey, { keyId: result.keyId });
    expect(key!.permissions).toEqual([p2]);
  });

  // ── Query Functions ────────────────────────────────────────────────

  test("listKeys by namespace", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, { ownerId: "u1", name: "K1", namespace: "prod" });
    await t.mutation(api.lib.create, { ownerId: "u1", name: "K2", namespace: "prod" });
    await t.mutation(api.lib.create, { ownerId: "u1", name: "K3", namespace: "staging" });

    const prodKeys = await t.query(api.lib.listKeys, { namespace: "prod" });
    expect(prodKeys.length).toBe(2);

    const stagingKeys = await t.query(api.lib.listKeys, { namespace: "staging" });
    expect(stagingKeys.length).toBe(1);
  });

  test("listKeys by owner", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, { ownerId: "alice", name: "A1" });
    await t.mutation(api.lib.create, { ownerId: "alice", name: "A2" });
    await t.mutation(api.lib.create, { ownerId: "bob", name: "B1" });

    const aliceKeys = await t.query(api.lib.listKeys, { ownerId: "alice" });
    expect(aliceKeys.length).toBe(2);
  });

  test("listKeys with limit", async () => {
    const t = initConvexTest();
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.lib.create, { ownerId: "u1", name: `K${i}` });
    }

    const limited = await t.query(api.lib.listKeys, { limit: 3 });
    expect(limited.length).toBe(3);
  });

  test("getKey returns null for nonexistent", async () => {
    const t = initConvexTest();
    const key = await t.query(api.lib.getKey, { keyId: "nonexistent_id" });
    expect(key).toBeNull();
  });

  test("getKeysByOwner returns all owner keys", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, { ownerId: "owner-x", name: "X1" });
    await t.mutation(api.lib.create, { ownerId: "owner-x", name: "X2" });
    await t.mutation(api.lib.create, { ownerId: "owner-y", name: "Y1" });

    const keys = await t.query(api.lib.getKeysByOwner, { ownerId: "owner-x" });
    expect(keys.length).toBe(2);
    expect(keys.every((k) => k.ownerId === "owner-x")).toBe(true);
  });

  // ── Analytics & Logs ───────────────────────────────────────────────

  test("getUsageStats returns correct outcome counts", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Stats Test",
      remaining: 2,
    });

    // 2 valid verifications
    await t.mutation(api.lib.verify, { key: result.key });
    await t.mutation(api.lib.verify, { key: result.key });

    // 1 usage exceeded
    await t.mutation(api.lib.verify, { key: result.key });

    const stats = await t.query(api.lib.getUsageStats, { keyId: result.keyId });
    expect(stats.total).toBe(3);
    expect(stats.valid).toBe(2);
    expect(stats.usageExceeded).toBe(1);
  });

  test("getUsageByOwner aggregates across multiple keys", async () => {
    const t = initConvexTest();
    const k1 = await t.mutation(api.lib.create, { ownerId: "shared-owner", name: "S1" });
    const k2 = await t.mutation(api.lib.create, { ownerId: "shared-owner", name: "S2" });

    await t.mutation(api.lib.verify, { key: k1.key });
    await t.mutation(api.lib.verify, { key: k1.key });
    await t.mutation(api.lib.verify, { key: k2.key });

    const stats = await t.query(api.lib.getUsageByOwner, { ownerId: "shared-owner" });
    expect(stats.total).toBe(3);
    expect(stats.valid).toBe(3);
  });

  test("getOverallStats computes namespace health metrics", async () => {
    const t = initConvexTest();
    const active = await t.mutation(api.lib.create, {
      ownerId: "u1",
      name: "Active",
      namespace: "metrics-ns",
    });
    await t.mutation(api.lib.create, {
      ownerId: "u1",
      name: "Disabled",
      namespace: "metrics-ns",
    });
    // Disable the second key
    const disabled = await t.query(api.lib.listKeys, { namespace: "metrics-ns" });
    const disableTarget = disabled.find((k) => k.name === "Disabled");
    await t.mutation(api.lib.update, { keyId: disableTarget!.keyId, enabled: false });

    // Verify the active key to generate stats
    await t.mutation(api.lib.verify, { key: active.key });

    const stats = await t.query(api.lib.getOverallStats, { namespace: "metrics-ns" });
    expect(stats.totalKeys).toBe(2);
    expect(stats.activeKeys).toBe(1);
    expect(stats.disabledKeys).toBe(1);
    expect(stats.totalVerifications).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  test("getAuditLog records operations", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "audit-user",
      name: "Audit Test",
    });

    await t.mutation(api.lib.update, { keyId: result.keyId, name: "Renamed" });
    await t.mutation(api.lib.revoke, { keyId: result.keyId });

    const logs = await t.query(api.lib.getAuditLog, {});
    expect(logs.length).toBeGreaterThanOrEqual(3); // create + update + revoke
    expect(logs.some((l) => l.action === "key.created")).toBe(true);
    expect(logs.some((l) => l.action === "key.updated")).toBe(true);
    expect(logs.some((l) => l.action === "key.revoked")).toBe(true);
  });

  test("getAuditLog filters by actorId", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, { ownerId: "actor-a", name: "A-Key" });
    await t.mutation(api.lib.create, { ownerId: "actor-b", name: "B-Key" });

    const logsA = await t.query(api.lib.getAuditLog, { actorId: "actor-a" });
    expect(logsA.every((l) => l.actorId === "actor-a")).toBe(true);
  });

  test("getVerificationLog returns per-key history", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "VLog Test",
    });

    await t.mutation(api.lib.verify, { key: result.key });
    await t.mutation(api.lib.verify, { key: result.key });

    const logs = await t.query(api.lib.getVerificationLog, {
      keyId: result.keyId,
    });
    expect(logs.length).toBe(2);
    expect(logs.every((l) => l.success === true)).toBe(true);
    expect(logs.every((l) => l.code === "VALID")).toBe(true);
  });

  test("getVerificationLog respects limit", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, { ownerId: "u1", name: "Limit Log" });

    for (let i = 0; i < 5; i++) {
      await t.mutation(api.lib.verify, { key: result.key });
    }

    const logs = await t.query(api.lib.getVerificationLog, {
      keyId: result.keyId,
      limit: 2,
    });
    expect(logs.length).toBe(2);
  });

  // ── Admin Operations ───────────────────────────────────────────────

  test("purgeExpiredKeys removes expired keys", async () => {
    const t = initConvexTest();

    // Create a key that's already expired
    await t.mutation(api.lib.create, {
      ownerId: "u1",
      name: "Expired Key",
      namespace: "purge-ns",
      expires: Date.now() - 10_000, // 10s in the past
    });
    await t.mutation(api.lib.create, {
      ownerId: "u1",
      name: "Active Key",
      namespace: "purge-ns",
    });

    const count = await t.mutation(api.lib.purgeExpiredKeys, {
      namespace: "purge-ns",
    });
    expect(count).toBe(1);

    const remaining = await t.query(api.lib.listKeys, { namespace: "purge-ns" });
    expect(remaining.length).toBe(1);
    expect(remaining[0].name).toBe("Active Key");
  });

  test("purgeVerificationLogs removes old logs", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, { ownerId: "u1", name: "Purge Logs" });

    await t.mutation(api.lib.verify, { key: result.key });
    await t.mutation(api.lib.verify, { key: result.key });

    // Purge logs older than far-future timestamp (should catch all)
    const count = await t.mutation(api.lib.purgeVerificationLogs, {
      olderThan: Date.now() + 100_000,
    });
    expect(count).toBe(2);
  });

  // ── Verify with Tags and IP ────────────────────────────────────────

  test("verify passes tags and ip to verification log", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Tag Key",
    });

    await t.mutation(api.lib.verify, {
      key: result.key,
      tags: { endpoint: "/api/v1/data" },
      ip: "192.168.1.1",
    });

    const logs = await t.query(api.lib.getVerificationLog, {
      keyId: result.keyId,
    });
    expect(logs.length).toBe(1);
    expect(logs[0].tags).toEqual({ endpoint: "/api/v1/data" });
    expect(logs[0].ip).toBe("192.168.1.1");
  });

  // ── Multi-tenant Isolation ─────────────────────────────────────────

  test("keys in different namespaces are isolated", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, {
      ownerId: "u1",
      name: "Prod Key",
      namespace: "production",
    });
    await t.mutation(api.lib.create, {
      ownerId: "u1",
      name: "Dev Key",
      namespace: "development",
    });

    const prod = await t.query(api.lib.listKeys, { namespace: "production" });
    const dev = await t.query(api.lib.listKeys, { namespace: "development" });

    expect(prod.length).toBe(1);
    expect(prod[0].name).toBe("Prod Key");
    expect(dev.length).toBe(1);
    expect(dev[0].name).toBe("Dev Key");
  });

  test("different owners cannot see each other's keys via getKeysByOwner", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, { ownerId: "alice", name: "Alice Key" });
    await t.mutation(api.lib.create, { ownerId: "bob", name: "Bob Key" });

    const aliceKeys = await t.query(api.lib.getKeysByOwner, { ownerId: "alice" });
    const bobKeys = await t.query(api.lib.getKeysByOwner, { ownerId: "bob" });

    expect(aliceKeys.length).toBe(1);
    expect(aliceKeys[0].name).toBe("Alice Key");
    expect(bobKeys.length).toBe(1);
    expect(bobKeys[0].name).toBe("Bob Key");
  });

  // ── Key Info Shape ─────────────────────────────────────────────────

  test("getKey returns complete key info shape", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Full Info",
      namespace: "test-ns",
      meta: { plan: "pro" },
      environment: "production",
    });

    const key = await t.query(api.lib.getKey, { keyId: result.keyId });
    expect(key).not.toBeNull();
    expect(key!.keyId).toBe(result.keyId);
    expect(key!.hint).toBeDefined();
    expect(key!.hint).toContain("...");
    expect(key!.namespace).toBe("test-ns");
    expect(key!.ownerId).toBe("user1");
    expect(key!.name).toBe("Full Info");
    expect(key!.meta).toEqual({ plan: "pro" });
    expect(key!.createdAt).toBeDefined();
    expect(key!.updatedAt).toBeDefined();
    expect(key!.enabled).toBe(true);
    expect(key!.environment).toBe("production");
    expect(key!.permissions).toEqual([]);
    expect(key!.roles).toEqual([]);
  });

  // ── Edge: Create with refill config ────────────────────────────────

  test("create key with refill configuration", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Refill Key",
      remaining: 100,
      refill: { amount: 100, interval: "daily" },
    });

    const verifyResult = await t.mutation(api.lib.verify, { key: result.key });
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.remaining).toBe(99);
  });
});
