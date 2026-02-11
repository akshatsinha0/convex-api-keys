import { v } from "convex/values";
import { mutation } from "../_generated/server.js";
import { generateKey, hashKey, generateHint } from "../crypto.js";
import type { CreateKeyArgs, CreateKeyResult, VerifyKeyArgs, VerificationResult, RevokeKeyArgs, UpdateKeyArgs, RotateKeyArgs } from "../types.js";

/*
(1.) Key lifecycle management functions for create, verify, revoke, update, and rotate operations.
(2.) Create generates cryptographically secure keys with SHA-256 hashing before storage.
(3.) Verify performs atomic validation checks including expiration, revocation, rate limits, and usage credits.
(4.) Revoke supports both soft deletion with audit trail and hard deletion removing records.
(5.) Update modifies key properties atomically with timestamp tracking.
(6.) Rotate generates new keys while optionally maintaining grace periods for old keys.

This module implements the core security-critical operations for API key lifecycle management.
All operations use SHA-256 hashing to ensure plaintext keys never persist in the database. The
verify function performs comprehensive validation in a single transaction, including rate limit
enforcement and usage credit decrementing. Revoke operations support both soft and hard deletion
patterns. Update operations are atomic and track modification timestamps. Rotate operations
generate new keys while preserving configuration and optionally allowing grace periods where
both old and new keys remain valid. All operations include audit logging for compliance and
debugging purposes.
*/

export const create = mutation({
  args: {
    ownerId: v.string(),
    name: v.optional(v.string()),
    meta: v.optional(v.any()),
    prefix: v.optional(v.string()),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    refill: v.optional(v.object({
      amount: v.number(),
      interval: v.string(),
    })),
    ratelimit: v.optional(v.object({
      limit: v.number(),
      duration: v.number(),
    })),
    roles: v.optional(v.array(v.string())),
    permissions: v.optional(v.array(v.string())),
    environment: v.optional(v.string()),
    namespace: v.optional(v.string()),
  },
  returns: v.object({
    key: v.string(),
    keyId: v.string(),
  }),
  handler: async (ctx, args): Promise<CreateKeyResult> => {
    const prefix = args.prefix || "sk_";
    const namespace = args.namespace || "default";
    const now = Date.now();

    const plaintext = generateKey(prefix, 32);
    const hash = await hashKey(plaintext);
    const hint = generateHint(plaintext);

    const refillData = args.refill ? {
      amount: args.refill.amount,
      interval: args.refill.interval,
      lastRefill: now,
    } : undefined;

    const ratelimitData = args.ratelimit ? {
      limit: args.ratelimit.limit,
      duration: args.ratelimit.duration,
      type: "sliding_window",
    } : undefined;

    const keyId = await ctx.db.insert("keys", {
      hash,
      prefix,
      hint,
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
    });

    await ctx.db.insert("auditLog", {
      action: "key.created",
      actorId: args.ownerId,
      targetKeyHash: hash,
      timestamp: now,
      details: {
        keyId: keyId.toString(),
        namespace,
        environment: args.environment,
      },
    });

    return {
      key: plaintext,
      keyId: keyId.toString(),
    };
  },
});


export const revoke = mutation({
  args: {
    keyId: v.string(),
    soft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await ctx.db.get(args.keyId as any);

    if (!keyRecord) {
      throw new Error("Key not found");
    }

    if (args.soft === false) {
      await ctx.db.delete(args.keyId as any);
    } else {
      await ctx.db.patch(args.keyId as any, {
        revokedAt: now,
        enabled: false,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "key.revoked",
      targetKeyHash: (keyRecord as any).hash,
      timestamp: now,
      details: {
        soft: args.soft !== false,
      },
    });
  },
});

export const update = mutation({
  args: {
    keyId: v.string(),
    name: v.optional(v.string()),
    meta: v.optional(v.any()),
    expires: v.optional(v.union(v.number(), v.null())),
    remaining: v.optional(v.number()),
    ratelimit: v.optional(v.object({
      limit: v.number(),
      duration: v.number(),
    })),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await ctx.db.get(args.keyId as any);

    if (!keyRecord) {
      throw new Error("Key not found");
    }

    const updates: any = {
      updatedAt: now,
    };

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

    await ctx.db.patch(args.keyId as any, updates);

    await ctx.db.insert("auditLog", {
      action: "key.updated",
      targetKeyHash: (keyRecord as any).hash,
      timestamp: now,
      details: updates,
    });
  },
});


export const rotate = mutation({
  args: {
    keyId: v.string(),
    gracePeriodMs: v.optional(v.number()),
  },
  returns: v.object({
    key: v.string(),
    keyId: v.string(),
  }),
  handler: async (ctx, args): Promise<CreateKeyResult> => {
    const now = Date.now();
    const oldKeyRecord = await ctx.db.get(args.keyId as any);

    if (!oldKeyRecord || (oldKeyRecord as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const oldKey = oldKeyRecord as any;
    const plaintext = generateKey(oldKey.prefix, 32);
    const hash = await hashKey(plaintext);
    const hint = generateHint(plaintext);

    const newKeyId = await ctx.db.insert("keys", {
      hash,
      prefix: oldKey.prefix,
      hint,
      namespace: oldKey.namespace,
      ownerId: oldKey.ownerId,
      name: oldKey.name,
      meta: oldKey.meta,
      createdAt: now,
      updatedAt: now,
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
      await ctx.db.patch(args.keyId as any, {
        rotationGraceEnd: now + args.gracePeriodMs,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.keyId as any, {
        enabled: false,
        revokedAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "key.rotated",
      targetKeyHash: oldKey.hash,
      timestamp: now,
      details: {
        newKeyId: newKeyId.toString(),
        newKeyHash: hash,
        gracePeriodMs: args.gracePeriodMs,
      },
    });

    return {
      key: plaintext,
      keyId: newKeyId.toString(),
    };
  },
});
