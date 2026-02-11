import { v } from "convex/values";
import { mutation } from "../_generated/server.js";

/*
(1.) Administrative cleanup functions for purging expired keys and old logs.
(2.) Provides manual data retention management for compliance and storage optimization.
(3.) Purge operations are logged in the audit trail for accountability.

This module implements administrative functions for data cleanup and retention
management. The purgeExpiredKeys function removes keys that have passed their
expiration date, while purgeVerificationLogs removes old verification logs
based on a timestamp cutoff. Both operations are audited for compliance tracking.
*/

export const purgeExpiredKeys = mutation({
  args: {
    namespace: v.string(),
    olderThan: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = args.olderThan || now;

    const expiredKeys = await ctx.db
      .query("keys")
      .withIndex("by_namespace", (q) => q.eq("namespace", args.namespace))
      .filter((q) => q.and(
        q.neq(q.field("expires"), undefined),
        q.lt(q.field("expires"), cutoff)
      ))
      .collect();

    for (const key of expiredKeys) {
      await ctx.db.delete(key._id);
    }

    await ctx.db.insert("auditLog", {
      action: "admin.purge_expired_keys",
      timestamp: now,
      details: { namespace: args.namespace, count: expiredKeys.length },
    });

    return expiredKeys.length;
  },
});

export const purgeVerificationLogs = mutation({
  args: {
    olderThan: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const oldLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.lt("timestamp", args.olderThan))
      .collect();

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    await ctx.db.insert("auditLog", {
      action: "admin.purge_verification_logs",
      timestamp: now,
      details: { olderThan: args.olderThan, count: oldLogs.length },
    });

    return oldLogs.length;
  },
});
