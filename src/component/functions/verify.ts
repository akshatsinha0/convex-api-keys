import { v } from "convex/values";
import { mutation } from "../_generated/server.js";
import { hashKey } from "../crypto.js";
import type { VerifyKeyArgs, VerificationResult, OutcomeCode } from "../types.js";

/*
(1.) Key verification function performing atomic validation checks for API key authentication.
(2.) Hashes provided key and performs single database lookup for key record retrieval.
(3.) Validates key status including enabled state, revocation, expiration, and rotation grace periods.
(4.) Enforces rate limiting using sliding window algorithm with concurrent request handling.
(5.) Decrements usage credits atomically and checks remaining balance before approval.
(6.) Resolves permissions from both direct assignments and role memberships.
(7.) Logs every verification attempt with outcome codes for audit and analytics.

This module implements the critical path for API key verification, executing all validation
checks in a single atomic transaction. The function hashes the provided key, looks up the
record by hash index, and performs sequential validation checks. Each check returns early
with specific outcome codes for different failure scenarios. Rate limiting uses optimistic
concurrency control via Convex transactions. Usage credit decrementing is atomic to prevent
race conditions. Permission resolution aggregates both direct permissions and permissions
inherited through roles. All verification attempts are logged regardless of outcome for
security auditing and usage analytics.
*/


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
    .withIndex("by_key_namespace", (q: any) =>
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
