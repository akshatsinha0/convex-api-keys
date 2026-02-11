import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("example", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  test("createApiKey and verifyApiKey", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const result = await t.mutation(api.example.createApiKey, {
      name: "Test Key",
    });
    expect(result.key).toBeDefined();
    expect(result.keyId).toBeDefined();

    const verifyResult = await t.mutation(api.example.verifyApiKey, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.code).toBe("VALID");
  });

  test("revokeApiKey prevents verification", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const result = await t.mutation(api.example.createApiKey, {
      name: "Revokable Key",
    });

    await t.mutation(api.example.revokeApiKey, {
      keyId: result.keyId,
    });

    const verifyResult = await t.mutation(api.example.verifyApiKey, {
      key: result.key,
    });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.code).toBe("REVOKED");
  });

  test("listMyKeys returns created keys", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    await t.mutation(api.example.createApiKey, { name: "Key 1" });
    await t.mutation(api.example.createApiKey, { name: "Key 2" });

    const keys = await t.query(api.example.listMyKeys, {});
    expect(keys.length).toBe(2);
  });
});
