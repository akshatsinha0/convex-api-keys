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
    const oneHourAgo = now - 60 * 60 * 1000;

    const recentLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.gt("timestamp", oneHourAgo))
      .collect();

    const rollupsByKey = new Map<
      string,
      { namespace: string } & ReturnType<typeof emptyStats>
    >();

    for (const log of recentLogs) {
      const key = await ctx.db
        .query("keys")
        .withIndex("by_hash", (q) => q.eq("hash", log.keyHash))
        .first();

      const namespace = key?.namespace || "unknown";
      const keyHash = log.keyHash;

      if (!rollupsByKey.has(keyHash)) {
        rollupsByKey.set(keyHash, { namespace, ...emptyStats() });
      }

      tallyLog(rollupsByKey.get(keyHash)!, log.code);
    }

    const hourTimestamp =
      Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

    for (const [keyHash, stats] of rollupsByKey) {
      const existing = await ctx.db
        .query("analyticsRollups")
        .withIndex("by_key_period", (q) =>
          q.eq("keyHash", keyHash).eq("period", "hour").eq("timestamp", hourTimestamp)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          valid: existing.valid + stats.valid,
          rateLimited: existing.rateLimited + stats.rateLimited,
          usageExceeded: existing.usageExceeded + stats.usageExceeded,
          expired: existing.expired + stats.expired,
          revoked: existing.revoked + stats.revoked,
          disabled: existing.disabled + stats.disabled,
          notFound: existing.notFound + stats.notFound,
          total: existing.total + stats.total,
        });
      } else {
        await ctx.db.insert("analyticsRollups", {
          namespace: stats.namespace,
          keyHash,
          period: "hour",
          timestamp: hourTimestamp,
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

    if (rollupsByKey.size > 0) {
      await logAudit(ctx, "cron.rollup_analytics", {
        keysProcessed: rollupsByKey.size,
        logsProcessed: recentLogs.length,
      });
    }
  },
});
