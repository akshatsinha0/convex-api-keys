import { internalMutation } from "../../_generated/server.js";
import { emptyStats, tallyLog } from "../shared/aggregateStats.js";
import { logAudit } from "../shared/auditLogger.js";

/*
(1.) Internal scheduled mutation for aggregating verification logs into hourly analytics rollups.
(2.) Groups recent logs by key hash and upserts into the analyticsRollups table.

This cron-triggered function reduces storage and query cost by pre-aggregating detailed
verification logs into hourly summary buckets. Existing rollups are updated additively;
new rollups are created for previously unseen key/hour combinations.
*/

export const rollupAnalytics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const HOUR_MS = 60 * 60 * 1000;
    const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
    const previousHourStart = currentHourStart - HOUR_MS;

    const recentLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) =>
        q.gte("timestamp", previousHourStart).lt("timestamp", currentHourStart)
      )
      .collect();

    if (recentLogs.length === 0) return;

    const keyHashCache = new Map<string, string>();
    const rollupsByKey = new Map<
      string,
      { namespace: string } & ReturnType<typeof emptyStats>
    >();

    for (const log of recentLogs) {
      const keyHash = log.keyHash;

      if (!keyHashCache.has(keyHash)) {
        const key = await ctx.db
          .query("keys")
          .withIndex("by_hash", (q) => q.eq("hash", keyHash))
          .first();
        keyHashCache.set(keyHash, key?.namespace || "unknown");
      }

      if (!rollupsByKey.has(keyHash)) {
        rollupsByKey.set(keyHash, { namespace: keyHashCache.get(keyHash)!, ...emptyStats() });
      }

      tallyLog(rollupsByKey.get(keyHash)!, log.code);
    }

    for (const [keyHash, stats] of rollupsByKey) {
      const existing = await ctx.db
        .query("analyticsRollups")
        .withIndex("by_key_period", (q) =>
          q.eq("keyHash", keyHash).eq("period", "hour").eq("timestamp", previousHourStart)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          valid: stats.valid,
          rateLimited: stats.rateLimited,
          usageExceeded: stats.usageExceeded,
          expired: stats.expired,
          revoked: stats.revoked,
          disabled: stats.disabled,
          notFound: stats.notFound,
          total: stats.total,
        });
      } else {
        await ctx.db.insert("analyticsRollups", {
          namespace: stats.namespace,
          keyHash,
          period: "hour",
          timestamp: previousHourStart,
          valid: stats.valid,
          rateLimited: stats.rateLimited,
          usageExceeded: stats.usageExceeded,
          expired: stats.expired,
          revoked: stats.revoked,
          disabled: stats.disabled,
          notFound: stats.notFound,
          total: stats.total,
        });
      }
    }

    await logAudit(ctx, "cron.rollup_analytics", {
      keysProcessed: rollupsByKey.size,
      logsProcessed: recentLogs.length,
    });
  },
});

export const rollupDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const currentDayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const previousDayStart = currentDayStart - DAY_MS;

    const hourlyRollups = await ctx.db
      .query("analyticsRollups")
      .filter((q) =>
        q.and(
          q.eq(q.field("period"), "hour"),
          q.gte(q.field("timestamp"), previousDayStart),
          q.lt(q.field("timestamp"), currentDayStart)
        )
      )
      .collect();

    if (hourlyRollups.length === 0) return;

    const byKey = new Map<string, { namespace: string } & ReturnType<typeof emptyStats>>();

    for (const r of hourlyRollups) {
      const kh = r.keyHash || "__ns__";
      if (!byKey.has(kh)) {
        byKey.set(kh, { namespace: r.namespace, ...emptyStats() });
      }
      const s = byKey.get(kh)!;
      s.total += r.total;
      s.valid += r.valid;
      s.rateLimited += r.rateLimited;
      s.usageExceeded += r.usageExceeded;
      s.expired += r.expired;
      s.revoked += r.revoked;
      s.disabled += r.disabled;
      s.notFound += r.notFound;
    }

    for (const [keyHash, stats] of byKey) {
      const actualKeyHash = keyHash === "__ns__" ? undefined : keyHash;

      const existing = await ctx.db
        .query("analyticsRollups")
        .withIndex("by_key_period", (q) =>
          q.eq("keyHash", actualKeyHash).eq("period", "day").eq("timestamp", previousDayStart)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          valid: stats.valid,
          rateLimited: stats.rateLimited,
          usageExceeded: stats.usageExceeded,
          expired: stats.expired,
          revoked: stats.revoked,
          disabled: stats.disabled,
          notFound: stats.notFound,
          total: stats.total,
        });
      } else {
        await ctx.db.insert("analyticsRollups", {
          namespace: stats.namespace,
          keyHash: actualKeyHash,
          period: "day",
          timestamp: previousDayStart,
          valid: stats.valid,
          rateLimited: stats.rateLimited,
          usageExceeded: stats.usageExceeded,
          expired: stats.expired,
          revoked: stats.revoked,
          disabled: stats.disabled,
          notFound: stats.notFound,
          total: stats.total,
        });
      }
    }

    await logAudit(ctx, "cron.rollup_daily", {
      keysProcessed: byKey.size,
      hourlyRollupsProcessed: hourlyRollups.length,
    });
  },
});
