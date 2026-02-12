import { v } from "convex/values";
import { query } from "../../_generated/server.js";
import type { Id } from "../../_generated/dataModel.js";
import { aggregateVerificationStats, emptyStats, tallyLog } from "../shared/aggregateStats.js";
import { mapKeyToInfo } from "../shared/mapKeyToInfo.js";

/*
(1.) Usage statistics queries aggregating verification logs by outcome code per key or owner.
(2.) getUsageStats provides per-key breakdowns; getUsageByOwner aggregates across all owner keys.
(3.) When period is specified, queries pre-aggregated analyticsRollups for efficient reads.

These queries power the analytics dashboard with real-time reactive updates via Convex
subscriptions. Both use the shared aggregateVerificationStats utility for consistent tallying.
When a period ("hour" or "day") is specified, rollup data is used instead of raw logs.
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

    if (args.period === "hour" || args.period === "day") {
      const rollups = await ctx.db
        .query("analyticsRollups")
        .withIndex("by_key_period", (q) =>
          q.eq("keyHash", key.hash).eq("period", args.period!)
        )
        .collect();

      const stats = emptyStats();
      for (const r of rollups) {
        stats.total += r.total;
        stats.valid += r.valid;
        stats.rateLimited += r.rateLimited;
        stats.usageExceeded += r.usageExceeded;
        stats.expired += r.expired;
        stats.revoked += r.revoked;
        stats.disabled += r.disabled;
        stats.notFound += r.notFound;
      }
      return stats;
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

    if (args.period === "hour" || args.period === "day") {
      for (const key of keys) {
        const rollups = await ctx.db
          .query("analyticsRollups")
          .withIndex("by_key_period", (q) =>
            q.eq("keyHash", key.hash).eq("period", args.period!)
          )
          .collect();

        for (const r of rollups) {
          stats.total += r.total;
          stats.valid += r.valid;
          stats.rateLimited += r.rateLimited;
          stats.usageExceeded += r.usageExceeded;
          stats.expired += r.expired;
          stats.revoked += r.revoked;
          stats.disabled += r.disabled;
          stats.notFound += r.notFound;
        }
      }
      return stats;
    }

    for (const key of keys) {
      const logs = await ctx.db
        .query("verificationLogs")
        .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
        .take(1000);

      for (const log of logs) {
        tallyLog(stats, log.code);
      }
    }

    return stats;
  },
});

export const getTopKeysByUsage = query({
  args: {
    namespace: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      keyHash: v.string(),
      keyId: v.optional(v.string()),
      name: v.optional(v.string()),
      ownerId: v.optional(v.string()),
      total: v.number(),
      valid: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const take = args.limit || 10;

    const rollups = await ctx.db
      .query("analyticsRollups")
      .withIndex("by_ns_period", (q) =>
        q.eq("namespace", args.namespace).eq("period", "hour")
      )
      .collect();

    const totals = new Map<string, { total: number; valid: number }>();
    for (const r of rollups) {
      if (!r.keyHash) continue;
      const existing = totals.get(r.keyHash) || { total: 0, valid: 0 };
      existing.total += r.total;
      existing.valid += r.valid;
      totals.set(r.keyHash, existing);
    }

    const sorted = Array.from(totals.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, take);

    const results = [];
    for (const [keyHash, stats] of sorted) {
      const key = await ctx.db
        .query("keys")
        .withIndex("by_hash", (q) => q.eq("hash", keyHash))
        .first();
      results.push({
        keyHash,
        keyId: key?._id.toString(),
        name: key?.name,
        ownerId: key?.ownerId,
        total: stats.total,
        valid: stats.valid,
      });
    }

    return results;
  },
});

export const getVerificationsOverTime = query({
  args: {
    keyId: v.optional(v.string()),
    namespace: v.optional(v.string()),
    period: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      timestamp: v.number(),
      total: v.number(),
      valid: v.number(),
      failed: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const period = args.period || "hour";

    if (args.keyId) {
      const key = await ctx.db.get(args.keyId as Id<"keys">);
      if (!key) return [];

      const rollups = await ctx.db
        .query("analyticsRollups")
        .withIndex("by_key_period", (q) => {
          const indexed = q.eq("keyHash", key.hash).eq("period", period);
          if (args.since) return indexed.gte("timestamp", args.since);
          return indexed;
        })
        .order("asc")
        .collect();

      return rollups.map((r) => ({
        timestamp: r.timestamp,
        total: r.total,
        valid: r.valid,
        failed: r.total - r.valid,
      }));
    }

    if (args.namespace) {
      const rollups = await ctx.db
        .query("analyticsRollups")
        .withIndex("by_ns_period", (q) => {
          const indexed = q.eq("namespace", args.namespace!).eq("period", period);
          if (args.since) return indexed.gte("timestamp", args.since);
          return indexed;
        })
        .order("asc")
        .collect();

      const buckets = new Map<number, { total: number; valid: number }>();
      for (const r of rollups) {
        const b = buckets.get(r.timestamp) || { total: 0, valid: 0 };
        b.total += r.total;
        b.valid += r.valid;
        buckets.set(r.timestamp, b);
      }

      return Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([ts, b]) => ({
          timestamp: ts,
          total: b.total,
          valid: b.valid,
          failed: b.total - b.valid,
        }));
    }

    return [];
  },
});
