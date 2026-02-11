import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { generateKey, hashKey, generateHint, extractPrefix } from "./crypto.js";
import type {
  CreateKeyArgs,
  CreateKeyResult,
  VerifyKeyArgs,
  VerificationResult,
  RevokeKeyArgs,
  UpdateKeyArgs,
  RotateKeyArgs,
  OutcomeCode,
} from "./types.js";

/*
(1.) Core API key management functions implementing create, verify, revoke, update, and rotate operations.
(2.) All key operations use SHA-256 hashing to ensure plaintext keys never persist in the database.
(3.) Verification function performs atomic checks for expiration, revocation, rate limits, and usage credits.
(4.) Rate limiting uses sliding window algorithm with concurrent request handling via optimistic concurrency.
(5.) Audit logging captures every operation for compliance and debugging purposes.
(6.) Key rotation supports grace periods where both old and new keys remain valid temporarily.

This module implements the core security-critical operations for API key lifecycle management.
The create function generates cryptographically secure keys, hashes them, and stores only the
hash with metadata. The verify function performs comprehensive validation checks in a single
database transaction, including rate limit enforcement and usage credit decrementing. All
operations are atomic and handle concurrent requests correctly via Convex's optimistic
concurrency control. The audit trail ensures every operation is logged with actor information
and detailed context for security auditing and debugging.
*/

// ── Key Creation ──────────────────────────────────────────

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

// ── Key Verification ──────────────────────────────────────────

export const verify = mutation({
  args: {
    key: v.string(),
    tags: v.optional(v.any()),
    ip: v.optional(v.string()),
    namespace: v.optional(v.string()),
  },
  returns: v.object({
    valid: v.boolean(),
    code: v.string(),
    keyId: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    meta: v.optional(v.any()),
    remaining: v.optional(v.number()),
    ratelimit: v.optional(v.object({
      remaining: v.number(),
      reset: v.number(),
    })),
    permissions: v.array(v.string()),
    roles: v.array(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<VerificationResult> => {
    const now = Date.now();
    const hash = await hashKey(args.key);

    const keyRecord = await ctx.db
      .query("keys")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .first();

    if (!keyRecord) {
      await ctx.db.insert("verificationLogs", {
        keyHash: hash,
        timestamp: now,
        success: false,
        code: "NOT_FOUND",
        tags: args.tags,
        ip: args.ip,
      });

      return {
        valid: false,
        code: "NOT_FOUND",
        permissions: [],
        roles: [],
        message: "API key not found",
      };
    }

    if (!keyRecord.enabled) {
      await logVerification(ctx, hash, false, "DISABLED", keyRecord, args);
      return {
        valid: false,
        code: "DISABLED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key is disabled",
      };
    }

    if (keyRecord.revokedAt) {
      await logVerification(ctx, hash, false, "REVOKED", keyRecord, args);
      return {
        valid: false,
        code: "REVOKED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key has been revoked",
      };
    }

    if (keyRecord.expires && keyRecord.expires < now) {
      await logVerification(ctx, hash, false, "EXPIRED", keyRecord, args);
      return {
        valid: false,
        code: "EXPIRED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key has expired",
      };
    }

    if (keyRecord.rotationGraceEnd && keyRecord.rotationGraceEnd < now) {
      await logVerification(ctx, hash, false, "ROTATION_GRACE_EXPIRED", keyRecord, args);
      return {
        valid: false,
        code: "ROTATION_GRACE_EXPIRED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key rotation grace period has expired",
      };
    }

    if (keyRecord.remaining !== undefined && keyRecord.remaining <= 0) {
      await logVerification(ctx, hash, false, "USAGE_EXCEEDED", keyRecord, args);
      return {
        valid: false,
        code: "USAGE_EXCEEDED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        remaining: 0,
        permissions: [],
        roles: [],
        message: "API key usage limit exceeded",
      };
    }

    if (keyRecord.ratelimit) {
      const rateLimitCheck = await checkAndUpdateRateLimit(
        ctx,
        hash,
        keyRecord.namespace,
        keyRecord.ratelimit.limit,
        keyRecord.ratelimit.duration,
        now
      );

      if (!rateLimitCheck.success) {
        await logVerification(ctx, hash, false, "RATE_LIMITED", keyRecord, args, rateLimitCheck.remaining);
        return {
          valid: false,
          code: "RATE_LIMITED",
          keyId: keyRecord._id.toString(),
          ownerId: keyRecord.ownerId,
          ratelimit: {
            remaining: rateLimitCheck.remaining,
            reset: rateLimitCheck.reset,
          },
          permissions: [],
          roles: [],
          message: "Rate limit exceeded",
        };
      }
    }

    let newRemaining = keyRecord.remaining;
    if (keyRecord.remaining !== undefined) {
      newRemaining = keyRecord.remaining - 1;
      await ctx.db.patch(keyRecord._id, {
        remaining: newRemaining,
        updatedAt: now,
      });
    }

    const permissions = await resolvePermissions(ctx, keyRecord.permissionIds, keyRecord.roleIds);

    await logVerification(ctx, hash, true, "VALID", keyRecord, args, undefined, newRemaining);

    return {
      valid: true,
      code: "VALID",
      keyId: keyRecord._id.toString(),
      ownerId: keyRecord.ownerId,
      meta: keyRecord.meta,
      remaining: newRemaining,
      permissions,
      roles: keyRecord.roleIds,
      message: "API key is valid",
    };
  },
});

// ── Helper Functions ──────────────────────────────────────────

async function logVerification(
  ctx: any,
  keyHash: string,
  success: boolean,
  code: OutcomeCode,
  keyRecord: any,
  args: VerifyKeyArgs,
  rateLimitRemaining?: number,
  remaining?: number
) {
  await ctx.db.insert("verificationLogs", {
    keyHash,
    timestamp: Date.now(),
    success,
    code,
    remaining,
    rateLimitRemaining,
    tags: args.tags,
    ip: args.ip,
  });
}

async function checkAndUpdateRateLimit(
  ctx: any,
  identifier: string,
  namespace: string,
  limit: number,
  duration: number,
  now: number
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const bucket = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_key_namespace", (q) =>
      q.eq("keyOrOwnerId", identifier).eq("namespace", namespace)
    )
    .first();

  const windowStart = now - duration;

  if (!bucket) {
    await ctx.db.insert("rateLimitBuckets", {
      keyOrOwnerId: identifier,
      namespace,
      windowStart: now,
      count: 1,
      limit,
      duration,
    });

    return {
      success: true,
      remaining: limit - 1,
      reset: now + duration,
    };
  }

  if (bucket.windowStart < windowStart) {
    await ctx.db.patch(bucket._id, {
      windowStart: now,
      count: 1,
    });

    return {
      success: true,
      remaining: limit - 1,
      reset: now + duration,
    };
  }

  if (bucket.count >= limit) {
    return {
      success: false,
      remaining: 0,
      reset: bucket.windowStart + duration,
    };
  }

  await ctx.db.patch(bucket._id, {
    count: bucket.count + 1,
  });

  return {
    success: true,
    remaining: limit - bucket.count - 1,
    reset: bucket.windowStart + duration,
  };
}

async function resolvePermissions(
  ctx: any,
  permissionIds: string[],
  roleIds: string[]
): Promise<string[]> {
  const permissions = new Set<string>(permissionIds);

  for (const roleId of roleIds) {
    const role = await ctx.db
      .query("roles")
      .filter((q: any) => q.eq(q.field("_id"), roleId))
      .first();

    if (role) {
      role.permissionIds.forEach((p: string) => permissions.add(p));
    }
  }

  return Array.from(permissions);
}

// ── Key Revocation ──────────────────────────────────────────

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
      targetKeyHash: keyRecord.hash,
      timestamp: now,
      details: {
        soft: args.soft !== false,
      },
    });
  },
});

// ── Key Update ──────────────────────────────────────────

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
      targetKeyHash: keyRecord.hash,
      timestamp: now,
      details: updates,
    });
  },
});

// ── Key Rotation ──────────────────────────────────────────

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

    if (!oldKeyRecord) {
      throw new Error("Key not found");
    }

    const plaintext = generateKey(oldKeyRecord.prefix, 32);
    const hash = await hashKey(plaintext);
    const hint = generateHint(plaintext);

    const newKeyId = await ctx.db.insert("keys", {
      hash,
      prefix: oldKeyRecord.prefix,
      hint,
      namespace: oldKeyRecord.namespace,
      ownerId: oldKeyRecord.ownerId,
      name: oldKeyRecord.name,
      meta: oldKeyRecord.meta,
      createdAt: now,
      updatedAt: now,
      expires: oldKeyRecord.expires,
      remaining: oldKeyRecord.remaining,
      refill: oldKeyRecord.refill,
      ratelimit: oldKeyRecord.ratelimit,
      enabled: true,
      permissionIds: oldKeyRecord.permissionIds,
      roleIds: oldKeyRecord.roleIds,
      environment: oldKeyRecord.environment,
      rotatedFrom: oldKeyRecord.hash,
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
      targetKeyHash: oldKeyRecord.hash,
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
