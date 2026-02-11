import { v } from "convex/values";
import { mutation, query } from "../_generated/server.js";

/*
(1.) Rate limit management functions for checking limits and managing overrides.
(2.) Provides manual rate limit checking and per-key override configuration.
(3.) Overrides allow administrators to set custom rate limits for specific keys.

This module exposes rate limit management capabilities for administrators to
configure custom rate limits on a per-key basis, overriding the default limits
set during key creation. The checkRateLimit function allows manual verification
of rate limit status without consuming a request quota.
*/

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
    const now = Date.now();
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

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

    await ctx.db.insert("auditLog", {
      action: "ratelimit.override_set",
      targetKeyHash: key.hash,
      timestamp: now,
      details: { limit: args.limit, duration: args.duration },
    });
  },
});

export const deleteRateLimitOverride = mutation({
  args: {
    keyId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

    const override = await ctx.db
      .query("rateLimitOverrides")
      .withIndex("by_key_namespace", (q) =>
        q.eq("keyOrOwnerId", key.hash).eq("namespace", key.namespace)
      )
      .first();

    if (override) {
      await ctx.db.delete(override._id);

      await ctx.db.insert("auditLog", {
        action: "ratelimit.override_deleted",
        targetKeyHash: key.hash,
        timestamp: now,
      });
    }
  },
});

export const getRateLimitOverrides = query({
  args: {
    namespace: v.string(),
  },
  returns: v.array(v.object({
    keyOrOwnerId: v.string(),
    namespace: v.string(),
    limit: v.number(),
    duration: v.number(),
  })),
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("rateLimitOverrides")
      .filter((q) => q.eq(q.field("namespace"), args.namespace))
      .collect();

    return overrides.map(o => ({
      keyOrOwnerId: o.keyOrOwnerId,
      namespace: o.namespace,
      limit: o.limit,
      duration: o.duration,
    }));
  },
});
