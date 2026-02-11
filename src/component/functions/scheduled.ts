import { internalMutation } from "../_generated/server.js";

/*
(1.) Internal scheduled mutation functions for automated maintenance tasks.
(2.) Runs periodically via cron jobs to expire keys, rollup analytics, and cleanup logs.
(3.) All operations are logged in the audit trail for monitoring and debugging.

This module implements internal scheduled functions that run automatically via
cron jobs. The expireKeys function disables keys that have passed their expiration
timestamp. The rollupAnalytics function aggregates verification logs into hourly
rollups for efficient analytics queries. The cleanupLogs function removes old
verification logs based on a 90-day retention policy.
*/

export const expireKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredKeys = await ctx.db
      .query("keys")
      .withIndex("by_expires")
      .filter((q) => q.and(
        q.neq(q.field("expires"), undefined),
        q.lt(q.field("expires"), now),
        q.eq(q.field("enabled"), true)
      ))
      .take(100);

    for (const key of expiredKeys) {
      await ctx.db.patch(key._id, {
        enabled: false,
        updatedAt: now,
      });
    }

    if (expiredKeys.length > 0) {
      await ctx.db.insert("auditLog", {
        action: "cron.expire_keys",
        timestamp: now,
        details: { count: expiredKeys.length },
      });
    }
  },
});

export const rollupAnalytics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const recentLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.gt("timestamp", oneHourAgo))
      .collect();

    const rollupsByKey = new Map<string, {
      namespace: string;
      valid: number;
      rateLimited: number;
      usageExceeded: number;
      expired: number;
      revoked: number;
      disabled: number;
      notFound: number;
      total: number;
    }>();

    for (const log of recentLogs) {
      const key = await ctx.db
        .query("keys")
        .withIndex("by_hash", (q) => q.eq("hash", log.keyHash))
        .first();

      const namespace = key?.namespace || "unknown";
      const keyHash = log.keyHash;

      if (!rollupsByKey.has(keyHash)) {
        rollupsByKey.set(keyHash, {
          namespace,
          valid: 0,
          rateLimited: 0,
          usageExceeded: 0,
          expired: 0,
          revoked: 0,
          disabled: 0,
          notFound: 0,
          total: 0,
        });
      }

      const stats = rollupsByKey.get(keyHash)!;
      stats.total++;

      if (log.code === "VALID") stats.valid++;
      else if (log.code === "RATE_LIMITED") stats.rateLimited++;
      else if (log.code === "USAGE_EXCEEDED") stats.usageExceeded++;
      else if (log.code === "EXPIRED") stats.expired++;
      else if (log.code === "REVOKED") stats.revoked++;
      else if (log.code === "DISABLED") stats.disabled++;
      else if (log.code === "NOT_FOUND") stats.notFound++;
    }

    const hourTimestamp = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

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
      await ctx.db.insert("auditLog", {
        action: "cron.rollup_analytics",
        timestamp: now,
        details: { keysProcessed: rollupsByKey.size, logsProcessed: recentLogs.length },
      });
    }
  },
});

export const cleanupLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const retentionDays = 90;
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;

    const oldLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.lt("timestamp", cutoff))
      .take(1000);

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    if (oldLogs.length > 0) {
      await ctx.db.insert("auditLog", {
        action: "cron.cleanup_logs",
        timestamp: now,
        details: { count: oldLogs.length, cutoff },
      });
    }
  },
});
