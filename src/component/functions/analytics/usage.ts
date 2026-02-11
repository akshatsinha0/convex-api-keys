import { v } from "convex/values";
import { query } from "../../_generated/server.js";
import type { Id } from "../../_generated/dataModel.js";
import { aggregateVerificationStats, emptyStats, tallyLog } from "../shared/aggregateStats.js";

/*
(1.) Usage statistics queries aggregating verification logs by outcome code per key or owner.
(2.) getUsageStats provides per-key breakdowns; getUsageByOwner aggregates across all owner keys.

These queries power the analytics dashboard with real-time reactive updates via Convex
subscriptions. Both use the shared aggregateVerificationStats utility for consistent tallying.
*/

export const getUsageStats = query({
  args: {
    keyId: v.string(),
    period: v.optional(v.string()),
  },
  returns: v.object({
    total: v.number(),
    valid: v.number(),
    rateLimited: v.number(),
    usageExceeded: v.number(),
    expired: v.number(),
    revoked: v.number(),
    disabled: v.number(),
    notFound: v.number(),
  }),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId as Id<"keys">);
    if (!key) {
      throw new Error("Key not found");
    }

    const logs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
      .collect();

    return aggregateVerificationStats(logs);
  },
});

export const getUsageByOwner = query({
  args: {
    ownerId: v.string(),
    period: v.optional(v.string()),
  },
  returns: v.object({
    total: v.number(),
    valid: v.number(),
    rateLimited: v.number(),
    usageExceeded: v.number(),
    expired: v.number(),
    revoked: v.number(),
    disabled: v.number(),
    notFound: v.number(),
  }),
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("keys")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    const stats = emptyStats();

    for (const key of keys) {
      const logs = await ctx.db
        .query("verificationLogs")
        .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
        .collect();

      for (const log of logs) {
        tallyLog(stats, log.code);
      }
    }

    return stats;
  },
});
