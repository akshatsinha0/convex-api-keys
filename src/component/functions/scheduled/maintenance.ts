import { internalMutation } from "../../_generated/server.js";
import { logAudit } from "../shared/auditLogger.js";

/*
(1.) Internal scheduled mutations for key expiration and log cleanup maintenance.
(2.) expireKeys disables keys past their expiration timestamp in batches of 100.
(3.) cleanupLogs removes verification logs older than the 90-day retention cutoff.

These cron-triggered functions maintain data hygiene within Convex transaction limits
by processing in bounded batches and using indexed queries for efficient scanning.
*/

export const expireKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredKeys = await ctx.db
      .query("keys")
      .withIndex("by_expires")
      .filter((q) =>
        q.and(
          q.neq(q.field("expires"), undefined),
          q.lt(q.field("expires"), now),
          q.eq(q.field("enabled"), true)
        )
      )
      .take(100);

    for (const key of expiredKeys) {
      await ctx.db.patch(key._id, { enabled: false, updatedAt: now });
    }

    if (expiredKeys.length > 0) {
      await logAudit(ctx, "cron.expire_keys", { count: expiredKeys.length });
    }
  },
});

export const cleanupLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - 90 * 24 * 60 * 60 * 1000;

    const oldLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.lt("timestamp", cutoff))
      .take(1000);

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    if (oldLogs.length > 0) {
      await logAudit(ctx, "cron.cleanup_logs", { count: oldLogs.length, cutoff });
    }
  },
});
