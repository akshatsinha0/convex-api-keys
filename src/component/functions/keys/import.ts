import { v } from "convex/values";
import { mutation } from "../../_generated/server.js";
import { logAudit } from "../shared/auditLogger.js";
import { assertNonEmpty } from "../shared/validation.js";
import type { Id } from "../../_generated/dataModel.js";

/*
(1.) Mutations for importing externally-created keys (e.g., from Unkey) into the component.
(2.) importKey inserts a mirror record with unkeyKeyId for tracking the external source.
(3.) logExternalVerification records verification results from external providers into local logs.

These mutations support the optional Unkey integration pattern where an external service
handles key generation and verification, while the component maintains a local mirror for
reactive queries, audit trails, and analytics. The importKey mutation creates a local
record linked to the external key via unkeyKeyId. The logExternalVerification mutation
writes to verificationLogs and syncs remaining credits from the external provider.
*/

export const importKey = mutation({
  args: {
    unkeyKeyId: v.string(),
    hash: v.string(),
    prefix: v.string(),
    hint: v.string(),
    namespace: v.optional(v.string()),
    ownerId: v.string(),
    name: v.optional(v.string()),
    meta: v.optional(v.any()),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    refill: v.optional(v.object({ amount: v.number(), interval: v.string() })),
    ratelimit: v.optional(v.object({ limit: v.number(), duration: v.number() })),
    roles: v.optional(v.array(v.string())),
    permissions: v.optional(v.array(v.string())),
    environment: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    assertNonEmpty(args.unkeyKeyId, "unkeyKeyId");
    assertNonEmpty(args.hash, "hash");

    const now = Date.now();
    const namespace = args.namespace || "default";

    const refillData = args.refill
      ? { amount: args.refill.amount, interval: args.refill.interval, lastRefill: now }
      : undefined;

    const ratelimitData = args.ratelimit
      ? { limit: args.ratelimit.limit, duration: args.ratelimit.duration, type: "sliding_window" }
      : undefined;

    const keyId = await ctx.db.insert("keys", {
      hash: args.hash,
      prefix: args.prefix,
      hint: args.hint,
      namespace,
      ownerId: args.ownerId,
      name: args.name || "Untitled Key",
      meta: args.meta,
      createdAt: now,
      updatedAt: now,
      expires: args.expires,
      remaining: args.remaining,
      refill: refillData,
      ratelimit: ratelimitData,
      enabled: true,
      permissionIds: args.permissions || [],
      roleIds: args.roles || [],
      environment: args.environment,
      unkeyKeyId: args.unkeyKeyId,
    });

    await logAudit(ctx, "key.imported", {
      keyId: keyId.toString(),
      namespace,
      source: "unkey",
      unkeyKeyId: args.unkeyKeyId,
    }, args.hash, args.ownerId);

    return keyId.toString();
  },
});

export const logExternalVerification = mutation({
  args: {
    unkeyKeyId: v.string(),
    success: v.boolean(),
    code: v.string(),
    remaining: v.optional(v.number()),
    rateLimitRemaining: v.optional(v.number()),
    tags: v.optional(v.any()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const keyRecord = await ctx.db
      .query("keys")
      .withIndex("by_unkey_id", (q) => q.eq("unkeyKeyId", args.unkeyKeyId))
      .first();

    const keyHash = keyRecord?.hash || `unkey:${args.unkeyKeyId}`;

    await ctx.db.insert("verificationLogs", {
      keyHash,
      timestamp: now,
      success: args.success,
      code: args.code,
      remaining: args.remaining,
      rateLimitRemaining: args.rateLimitRemaining,
      tags: args.tags,
      ip: args.ip,
    });

    if (keyRecord && args.remaining !== undefined) {
      await ctx.db.patch(keyRecord._id as Id<"keys">, {
        remaining: args.remaining,
        updatedAt: now,
      });
    }
  },
});
