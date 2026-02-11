import { v } from "convex/values";
import { query } from "../_generated/server.js";

/*
(1.) Analytics functions for usage statistics, verification logs, and audit trail queries.
(2.) Usage stats aggregate verification logs by outcome codes for per-key analytics.
(3.) Overall stats compute namespace-level metrics including key counts and success rates.
(4.) Verification logs provide detailed history of all key verification attempts.
(5.) Audit logs track all operations with filtering by key, actor, and time ranges.

This module implements analytics and logging queries for monitoring API key usage and system
operations. Usage statistics aggregate verification logs to show outcome distributions per key.
Overall statistics provide namespace-level health metrics. Verification logs maintain detailed
history of every authentication attempt with outcome codes, rate limit state, and custom tags.
Audit logs track all administrative operations for compliance and security investigations. All
queries support reactive subscriptions for real-time dashboard updates.
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
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

    const logs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
      .collect();

    const stats = {
      total: logs.length,
      valid: 0,
      rateLimited: 0,
      usageExceeded: 0,
      expired: 0,
      revoked: 0,
      disabled: 0,
      notFound: 0,
    };

    for (const log of logs) {
      if (log.code === "VALID") stats.valid++;
      else if (log.code === "RATE_LIMITED") stats.rateLimited++;
      else if (log.code === "USAGE_EXCEEDED") stats.usageExceeded++;
      else if (log.code === "EXPIRED") stats.expired++;
      else if (log.code === "REVOKED") stats.revoked++;
      else if (log.code === "DISABLED") stats.disabled++;
      else if (log.code === "NOT_FOUND") stats.notFound++;
    }

    return stats;
  },
});


export const getOverallStats = query({
  args: {
    namespace: v.string(),
  },
  returns: v.object({
    totalKeys: v.number(),
    activeKeys: v.number(),
    disabledKeys: v.number(),
    expiredKeys: v.number(),
    revokedKeys: v.number(),
    totalVerifications: v.number(),
    successRate: v.number(),
  }),
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("keys")
      .withIndex("by_namespace", (q) => q.eq("namespace", args.namespace))
      .collect();

    const now = Date.now();
    let activeKeys = 0;
    let disabledKeys = 0;
    let expiredKeys = 0;
    let revokedKeys = 0;

    for (const key of keys) {
      if (key.revokedAt) {
        revokedKeys++;
      } else if (!key.enabled) {
        disabledKeys++;
      } else if (key.expires && key.expires < now) {
        expiredKeys++;
      } else {
        activeKeys++;
      }
    }

    const logs = await ctx.db.query("verificationLogs").collect();
    const totalVerifications = logs.length;
    const successfulVerifications = logs.filter(l => l.success).length;
    const successRate = totalVerifications > 0 ? successfulVerifications / totalVerifications : 0;

    return {
      totalKeys: keys.length,
      activeKeys,
      disabledKeys,
      expiredKeys,
      revokedKeys,
      totalVerifications,
      successRate,
    };
  },
});

export const getAuditLog = query({
  args: {
    keyId: v.optional(v.string()),
    actorId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    action: v.string(),
    actorId: v.optional(v.string()),
    targetKeyHash: v.optional(v.string()),
    timestamp: v.number(),
    details: v.optional(v.any()),
  })),
  handler: async (ctx, args) => {
    let logs: any[] = [];

    if (args.keyId) {
      const keyDoc = await ctx.db.get(args.keyId as any);
      if (keyDoc && (keyDoc as any)._tableName === "keys") {
        const key = keyDoc as any;
        logs = await ctx.db
          .query("auditLog")
          .withIndex("by_key", (q) => q.eq("targetKeyHash", key.hash))
          .order("desc")
          .take(args.limit || 100);
      }
    } else if (args.actorId) {
      logs = await ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorId", args.actorId!))
        .order("desc")
        .take(args.limit || 100);
    } else {
      logs = await ctx.db
        .query("auditLog")
        .withIndex("by_time")
        .order("desc")
        .take(args.limit || 100);
    }

    return logs.map(l => ({
      action: l.action,
      actorId: l.actorId,
      targetKeyHash: l.targetKeyHash,
      timestamp: l.timestamp,
      details: l.details,
    }));
  },
});

export const getVerificationLog = query({
  args: {
    keyId: v.string(),
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
  },
  returns: v.array(v.object({
    keyHash: v.string(),
    timestamp: v.number(),
    success: v.boolean(),
    code: v.string(),
    remaining: v.optional(v.number()),
    rateLimitRemaining: v.optional(v.number()),
    tags: v.optional(v.any()),
    ip: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

    const logs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
      .order("desc")
      .take(args.limit || 100);

    return logs.map(l => ({
      keyHash: l.keyHash,
      timestamp: l.timestamp,
      success: l.success,
      code: l.code,
      remaining: l.remaining,
      rateLimitRemaining: l.rateLimitRemaining,
      tags: l.tags,
      ip: l.ip,
    }));
  },
});
