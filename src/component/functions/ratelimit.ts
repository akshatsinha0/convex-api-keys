import { v } from "convex/values";
import { mutation, query } from "../_generated/server.js";
import type { Id } from "../_generated/dataModel.js";
import { checkAndUpdateRateLimit } from "./shared/ratelimitCore.js";
import { logAudit } from "./shared/auditLogger.js";
import { assertKeyExists, assertPositive } from "./shared/validation.js";

/*
(1.) Rate limit management functions for checking limits and managing overrides.
(2.) Provides manual rate limit checking and per-key override configuration.
(3.) Overrides allow administrators to set custom rate limits for specific keys.

This module exposes rate limit management capabilities for administrators to
configure custom rate limits on a per-key basis, overriding the default limits
set during key creation. The checkRateLimit function allows manual verification
of rate limit status without consuming a request quota.
*/

export const checkRateLimit = mutation({
  args: {
    identifier: v.string(),
    namespace: v.string(),
    limit: v.number(),
    duration: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    remaining: v.number(),
    reset: v.number(),
  }),
  handler: async (ctx, args) => {
    assertPositive(args.limit, "limit");
    assertPositive(args.duration, "duration");

    return await checkAndUpdateRateLimit(
      ctx,
      args.identifier,
      args.namespace,
      args.limit,
      args.duration,
      Date.now()
    );
  },
});

export const setRateLimitOverride = mutation({
  args: {
    keyId: v.string(),
    limit: v.number(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    assertPositive(args.limit, "limit");
    assertPositive(args.duration, "duration");

    const key = await assertKeyExists(ctx, args.keyId);

    const existing = await ctx.db
      .query("rateLimitOverrides")
      .withIndex("by_key_namespace", (q) =>
        q.eq("keyOrOwnerId", key.hash).eq("namespace", key.namespace)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        limit: args.limit,
        duration: args.duration,
      });
    } else {
      await ctx.db.insert("rateLimitOverrides", {
        keyOrOwnerId: key.hash,
        namespace: key.namespace,
        limit: args.limit,
        duration: args.duration,
      });
    }

    await logAudit(
      ctx,
      "ratelimit.override_set",
      { limit: args.limit, duration: args.duration },
      key.hash
    );
  },
});

export const deleteRateLimitOverride = mutation({
  args: { keyId: v.string() },
  handler: async (ctx, args) => {
    const key = await assertKeyExists(ctx, args.keyId);

    const override = await ctx.db
      .query("rateLimitOverrides")
      .withIndex("by_key_namespace", (q) =>
        q.eq("keyOrOwnerId", key.hash).eq("namespace", key.namespace)
      )
      .first();

    if (override) {
      await ctx.db.delete(override._id);
      await logAudit(ctx, "ratelimit.override_deleted", undefined, key.hash);
    }
  },
});

export const getRateLimitOverrides = query({
  args: { namespace: v.string() },
  returns: v.array(
    v.object({
      keyOrOwnerId: v.string(),
      namespace: v.string(),
      limit: v.number(),
      duration: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("rateLimitOverrides")
      .filter((q) => q.eq(q.field("namespace"), args.namespace))
      .collect();

    return overrides.map((o) => ({
      keyOrOwnerId: o.keyOrOwnerId,
      namespace: o.namespace,
      limit: o.limit,
      duration: o.duration,
    }));
  },
});
