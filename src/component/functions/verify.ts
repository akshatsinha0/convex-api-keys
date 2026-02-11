import { v } from "convex/values";
import { mutation } from "../_generated/server.js";
import { hashKey } from "../crypto.js";
import type { VerificationResult } from "../types.js";
import { checkAndUpdateRateLimit } from "./shared/ratelimitCore.js";
import {
  checkKeyValidity,
  applyRefillIfNeeded,
  resolvePermissions,
  logVerification,
} from "./shared/verifyChecks.js";

/*
(1.) Key verification mutation performing atomic validation for API key authentication.
(2.) Orchestrates checks extracted into verifyChecks: validity, refill, rate limit, permissions.
(3.) Logs every verification attempt with outcome codes for audit and analytics.

This module implements the critical path for API key verification. The handler hashes the
provided key, looks it up, delegates validation to shared check functions, and returns
a comprehensive result with permissions, remaining credits, and rate limit status.
*/

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
    ratelimit: v.optional(v.object({ remaining: v.number(), reset: v.number() })),
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
      await logVerification(ctx, hash, false, "NOT_FOUND", args);
      return { valid: false, code: "NOT_FOUND", permissions: [], roles: [], message: "API key not found" };
    }

    const check = checkKeyValidity(keyRecord, now);
    if (!check.valid) {
      await logVerification(ctx, hash, false, check.code, args);
      return {
        valid: false, code: check.code,
        keyId: keyRecord._id.toString(), ownerId: keyRecord.ownerId,
        permissions: [], roles: [], message: check.message,
      };
    }

    await applyRefillIfNeeded(ctx, keyRecord, now);

    if (keyRecord.remaining !== undefined && keyRecord.remaining <= 0) {
      await logVerification(ctx, hash, false, "USAGE_EXCEEDED", args);
      return {
        valid: false, code: "USAGE_EXCEEDED",
        keyId: keyRecord._id.toString(), ownerId: keyRecord.ownerId,
        remaining: 0, permissions: [], roles: [], message: "API key usage limit exceeded",
      };
    }

    if (keyRecord.ratelimit) {
      const override = await ctx.db
        .query("rateLimitOverrides")
        .withIndex("by_key_namespace", (q) =>
          q.eq("keyOrOwnerId", hash).eq("namespace", keyRecord.namespace)
        )
        .first();

      const rl = await checkAndUpdateRateLimit(
        ctx, hash, keyRecord.namespace,
        override ? override.limit : keyRecord.ratelimit.limit,
        override ? override.duration : keyRecord.ratelimit.duration,
        now
      );

      if (!rl.success) {
        await logVerification(ctx, hash, false, "RATE_LIMITED", args, rl.remaining);
        return {
          valid: false, code: "RATE_LIMITED",
          keyId: keyRecord._id.toString(), ownerId: keyRecord.ownerId,
          ratelimit: { remaining: rl.remaining, reset: rl.reset },
          permissions: [], roles: [], message: "Rate limit exceeded",
        };
      }
    }

    let newRemaining = keyRecord.remaining;
    if (keyRecord.remaining !== undefined) {
      newRemaining = keyRecord.remaining - 1;
      await ctx.db.patch(keyRecord._id, { remaining: newRemaining, updatedAt: now });
    }

    const permissions = await resolvePermissions(ctx, keyRecord.permissionIds, keyRecord.roleIds);
    await logVerification(ctx, hash, true, "VALID", args, undefined, newRemaining);

    return {
      valid: true, code: "VALID",
      keyId: keyRecord._id.toString(), ownerId: keyRecord.ownerId,
      meta: keyRecord.meta, remaining: newRemaining,
      permissions, roles: keyRecord.roleIds, message: "API key is valid",
    };
  },
});
