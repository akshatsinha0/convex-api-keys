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

  test("create and verify key", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Test Key",
      namespace: "default",
    });
    expect(result.key).toBeDefined();
    expect(result.keyId).toBeDefined();

    const verifyResult = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.code).toBe("VALID");
    expect(verifyResult.ownerId).toBe("user1");
  });

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
  });

  test("update key", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Original Name",
    });

    await t.mutation(api.lib.update, {
      keyId: result.keyId,
      name: "Updated Name",
      enabled: true,
    });

    const key = await t.query(api.lib.getKey, { keyId: result.keyId });
    expect(key?.name).toBe("Updated Name");
  });

  test("rotate key", async () => {
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

    // Old key should be revoked
    const oldVerify = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(oldVerify.valid).toBe(false);

    // New key should work
    const newVerify = await t.mutation(api.lib.verify, {
      key: rotated.key,
    });
    expect(newVerify.valid).toBe(true);
  });

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
  });

  test("permission and role assignment", async () => {
    const t = initConvexTest();

    const permId = await t.mutation(api.lib.createPermission, {
      name: "read:data",
      description: "Read data access",
    });
    expect(permId).toBeDefined();

    const roleId = await t.mutation(api.lib.createRole, {
      name: "reader",
      permissions: [permId],
    });
    expect(roleId).toBeDefined();

    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "RBAC Test",
      permissions: [permId],
      roles: [roleId],
    });

    const verifyResult = await t.mutation(api.lib.verify, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.permissions).toContain(permId);
    expect(verifyResult.roles).toContain(roleId);
  });

  test("getUsageStats returns correct counts", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Stats Test",
    });

    await t.mutation(api.lib.verify, { key: result.key });
    await t.mutation(api.lib.verify, { key: result.key });

    const stats = await t.query(api.lib.getUsageStats, {
      keyId: result.keyId,
    });
    expect(stats.total).toBe(2);
    expect(stats.valid).toBe(2);
  });

  test("listKeys returns keys", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Key 1",
      namespace: "test",
    });
    await t.mutation(api.lib.create, {
      ownerId: "user1",
      name: "Key 2",
      namespace: "test",
    });

    const keys = await t.query(api.lib.listKeys, { namespace: "test" });
    expect(keys.length).toBe(2);
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
});
