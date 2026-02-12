import { v } from "convex/values";
import { mutation } from "../../_generated/server.js";
import { generateKey, hashKey, generateHint } from "../../crypto.js";
import { logAudit } from "../shared/auditLogger.js";
import { assertKeyExists } from "../shared/validation.js";
import type { CreateKeyResult } from "../../types/keys.js";
import type { Id } from "../../_generated/dataModel.js";

/*
(1.) Key creation and revocation mutations for API key lifecycle management.
(2.) Create generates cryptographically secure keys with SHA-256 hashing before storage.
(3.) Revoke supports both soft deletion (timestamped disable) and hard deletion (record removal).

This module implements the entry and exit points of the key lifecycle. Create generates
256-bit entropy keys, hashes them for storage, and initializes all associated configuration.
Revoke supports compliance-friendly soft deletion with audit trail preservation.
*/

export const create = mutation({
  args: {
    ownerId: v.string(),
    name: v.optional(v.string()),
    meta: v.optional(v.any()),
    prefix: v.optional(v.string()),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    refill: v.optional(v.object({ amount: v.number(), interval: v.string() })),
    ratelimit: v.optional(v.object({ limit: v.number(), duration: v.number() })),
    roles: v.optional(v.array(v.string())),
    permissions: v.optional(v.array(v.string())),
    environment: v.optional(v.string()),
    namespace: v.optional(v.string()),
    keyBytes: v.optional(v.number()),
  },
  returns: v.object({ key: v.string(), keyId: v.string() }),
  handler: async (ctx, args): Promise<CreateKeyResult> => {
    const prefix = args.prefix || "sk_";
    const namespace = args.namespace || "default";
    const now = Date.now();

    const plaintext = generateKey(prefix, args.keyBytes || 32);
    const hash = await hashKey(plaintext);
    const hint = generateHint(plaintext);

    const refillData = args.refill
      ? { amount: args.refill.amount, interval: args.refill.interval, lastRefill: now }
      : undefined;

    const ratelimitData = args.ratelimit
      ? { limit: args.ratelimit.limit, duration: args.ratelimit.duration, type: "sliding_window" }
      : undefined;

    const keyId = await ctx.db.insert("keys", {
      hash, prefix, hint, namespace,
      ownerId: args.ownerId,
      name: args.name || "Untitled Key",
      meta: args.meta,
      createdAt: now, updatedAt: now,
      expires: args.expires,
      remaining: args.remaining,
      refill: refillData,
      ratelimit: ratelimitData,
      enabled: true,
      permissionIds: args.permissions || [],
      roleIds: args.roles || [],
      environment: args.environment,
    });

    await logAudit(ctx, "key.created", {
      keyId: keyId.toString(), namespace, environment: args.environment,
    }, hash, args.ownerId);

    return { key: plaintext, keyId: keyId.toString() };
  },
});

export const revoke = mutation({
  args: {
    keyId: v.string(),
    soft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await assertKeyExists(ctx, args.keyId);

    if (args.soft === false) {
      await ctx.db.delete(args.keyId as Id<"keys">);
    } else {
      await ctx.db.patch(args.keyId as Id<"keys">, {
        revokedAt: now, enabled: false, updatedAt: now,
      });
    }

    await logAudit(ctx, "key.revoked", {
      soft: args.soft !== false,
    }, keyRecord.hash);
  },
});
