import { v } from "convex/values";
import { query } from "../../_generated/server.js";
import type { Id } from "../../_generated/dataModel.js";

/*
(1.) Analytics queries for audit logs and verification logs with filtering and pagination.
(2.) getAuditLog supports filtering by key, actor, or time with configurable limits.
(3.) getVerificationLog provides time-range filtered verification history per key.

These queries support compliance monitoring and operational dashboards with reactive
subscriptions. Audit logs filter by key or actor; verification logs filter by time range.
*/

export const getAuditLog = query({
  args: {
    keyId: v.optional(v.string()),
    actorId: v.optional(v.string()),
    actionType: v.optional(v.string()),
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      action: v.string(),
      actorId: v.optional(v.string()),
      targetKeyHash: v.optional(v.string()),
      timestamp: v.number(),
      details: v.optional(v.any()),
    })
  ),
  handler: async (ctx, args) => {
    const take = args.limit || 100;
    let logs;

    if (args.keyId) {
      const keyDoc = await ctx.db.get(args.keyId as Id<"keys">);
      if (!keyDoc) return [];
      logs = await ctx.db
        .query("auditLog")
        .withIndex("by_key", (q) => {
          const indexed = q.eq("targetKeyHash", keyDoc.hash);
          if (args.since !== undefined) return indexed.gte("timestamp", args.since);
          return indexed;
        })
        .order("desc")
        .take(take);
    } else if (args.actorId) {
      logs = await ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => {
          const indexed = q.eq("actorId", args.actorId!);
          if (args.since !== undefined) return indexed.gte("timestamp", args.since);
          return indexed;
        })
        .order("desc")
        .take(take);
    } else {
      logs = await ctx.db
        .query("auditLog")
        .withIndex("by_time", (q) => {
          if (args.since !== undefined) return q.gte("timestamp", args.since);
          return q;
        })
        .order("desc")
        .take(take);
    }

    const filtered = args.actionType
      ? logs.filter((l) => l.action === args.actionType)
      : logs;

    return filtered.map((l) => ({
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
  returns: v.array(
    v.object({
      keyHash: v.string(),
      timestamp: v.number(),
      success: v.boolean(),
      code: v.string(),
      remaining: v.optional(v.number()),
      rateLimitRemaining: v.optional(v.number()),
      tags: v.optional(v.any()),
      ip: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const keyDoc = await ctx.db.get(args.keyId as Id<"keys">);
    if (!keyDoc) {
      throw new Error("Key not found");
    }

    const logsQuery = ctx.db
      .query("verificationLogs")
      .withIndex("by_key_time", (q) => {
        const indexed = q.eq("keyHash", keyDoc.hash);
        if (args.since !== undefined) {
          return indexed.gte("timestamp", args.since);
        }
        return indexed;
      });

    const logs = await logsQuery.order("desc").take(args.limit || 100);

    return logs.map((l) => ({
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
