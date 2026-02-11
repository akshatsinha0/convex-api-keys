import { v } from "convex/values";
import { mutation } from "../../_generated/server.js";
import { generateKey, hashKey, generateHint } from "../../crypto.js";
import { logAudit } from "../shared/auditLogger.js";
import { assertKeyExists } from "../shared/validation.js";
import type { CreateKeyResult } from "../../types/keys.js";
import type { Id } from "../../_generated/dataModel.js";

/*
(1.) Key update and rotation mutations for modifying existing API key properties.
(2.) Update atomically patches key fields with timestamp tracking and audit logging.
(3.) Rotate generates a new key inheriting the old key's configuration with optional grace period.

This module implements non-destructive key modifications. Update supports partial field
changes with automatic updatedAt tracking. Rotate creates a successor key that inherits
all configuration from the original, optionally allowing both keys to remain valid during
a grace period for zero-downtime key rotation in distributed systems.
*/

export const update = mutation({
  args: {
    keyId: v.string(),
    name: v.optional(v.string()),
    meta: v.optional(v.any()),
    expires: v.optional(v.union(v.number(), v.null())),
    remaining: v.optional(v.number()),
    ratelimit: v.optional(v.object({ limit: v.number(), duration: v.number() })),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await assertKeyExists(ctx, args.keyId);

    const updates: Record<string, unknown> = { updatedAt: now };

    if (args.name !== undefined) updates.name = args.name;
    if (args.meta !== undefined) updates.meta = args.meta;
    if (args.expires !== undefined) updates.expires = args.expires;
    if (args.remaining !== undefined) updates.remaining = args.remaining;
    if (args.enabled !== undefined) updates.enabled = args.enabled;

    if (args.ratelimit !== undefined) {
      updates.ratelimit = {
        limit: args.ratelimit.limit,
        duration: args.ratelimit.duration,
        type: "sliding_window",
      };
    }

    await ctx.db.patch(args.keyId as Id<"keys">, updates);
    await logAudit(ctx, "key.updated", updates, keyRecord.hash);
  },
});

export const rotate = mutation({
  args: {
    keyId: v.string(),
    gracePeriodMs: v.optional(v.number()),
  },
  returns: v.object({ key: v.string(), keyId: v.string() }),
  handler: async (ctx, args): Promise<CreateKeyResult> => {
    const now = Date.now();
    const oldKey = await assertKeyExists(ctx, args.keyId);

    const plaintext = generateKey(oldKey.prefix, 32);
    const hash = await hashKey(plaintext);
    const hint = generateHint(plaintext);

    const newKeyId = await ctx.db.insert("keys", {
      hash, prefix: oldKey.prefix, hint,
      namespace: oldKey.namespace,
      ownerId: oldKey.ownerId,
      name: oldKey.name,
      meta: oldKey.meta,
      createdAt: now, updatedAt: now,
      expires: oldKey.expires,
      remaining: oldKey.remaining,
      refill: oldKey.refill,
      ratelimit: oldKey.ratelimit,
      enabled: true,
      permissionIds: oldKey.permissionIds,
      roleIds: oldKey.roleIds,
      environment: oldKey.environment,
      rotatedFrom: oldKey.hash,
    });

    if (args.gracePeriodMs) {
      await ctx.db.patch(args.keyId as Id<"keys">, {
        rotationGraceEnd: now + args.gracePeriodMs, updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.keyId as Id<"keys">, {
        enabled: false, revokedAt: now, updatedAt: now,
      });
    }

    await logAudit(ctx, "key.rotated", {
      newKeyId: newKeyId.toString(), newKeyHash: hash, gracePeriodMs: args.gracePeriodMs,
    }, oldKey.hash);

    return { key: plaintext, keyId: newKeyId.toString() };
  },
});
