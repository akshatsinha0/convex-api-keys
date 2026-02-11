import { v } from "convex/values";
import { query } from "../_generated/server.js";

/*
(1.) Query functions for retrieving key information, usage statistics, and audit logs.
(2.) List functions support filtering by owner, namespace, and pagination for large datasets.
(3.) Usage statistics aggregate verification logs by outcome codes for analytics dashboards.
(4.) Overall stats provide namespace-level metrics including key counts and success rates.
(5.) Audit log queries support filtering by key, actor, and time ranges with reactive subscriptions.

This module implements read-only query functions for accessing key data and analytics. All
queries are reactive via Convex subscriptions, enabling real-time dashboard updates. List
functions support multiple filtering strategies and pagination for efficient data retrieval.
Usage statistics aggregate verification logs to provide outcome breakdowns per key. Overall
stats compute namespace-level metrics for monitoring system health. Audit log queries enable
compliance tracking and security investigations with flexible filtering options.
*/

export const listKeys = query({
  args: {
    namespace: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    keyId: v.string(),
    hint: v.string(),
    namespace: v.string(),
    ownerId: v.string(),
    name: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    enabled: v.boolean(),
    revokedAt: v.optional(v.number()),
    environment: v.optional(v.string()),
    permissions: v.array(v.string()),
    roles: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    let keys;

    if (args.ownerId) {
      keys = await ctx.db
        .query("keys")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId!))
        .take(args.limit || 100);
    } else if (args.namespace) {
      keys = await ctx.db
        .query("keys")
        .withIndex("by_namespace", (q) => q.eq("namespace", args.namespace!))
        .take(args.limit || 100);
    } else {
      keys = await ctx.db.query("keys").take(args.limit || 100);
    }

    return keys.map(k => ({
      keyId: k._id.toString(),
      hint: k.hint,
      namespace: k.namespace,
      ownerId: k.ownerId,
      name: k.name,
      meta: k.meta,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      expires: k.expires,
      remaining: k.remaining,
      enabled: k.enabled,
      revokedAt: k.revokedAt,
      environment: k.environment,
      permissions: k.permissionIds,
      roles: k.roleIds,
    }));
  },
});

export const getKey = query({
  args: {
    keyId: v.string(),
  },
  returns: v.union(v.null(), v.object({
    keyId: v.string(),
    hint: v.string(),
    namespace: v.string(),
    ownerId: v.string(),
    name: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    enabled: v.boolean(),
    revokedAt: v.optional(v.number()),
    environment: v.optional(v.string()),
    permissions: v.array(v.string()),
    roles: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      return null;
    }

    const key = keyDoc as any;

    return {
      keyId: key._id.toString(),
      hint: key.hint,
      namespace: key.namespace,
      ownerId: key.ownerId,
      name: key.name,
      meta: key.meta,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      expires: key.expires,
      remaining: key.remaining,
      enabled: key.enabled,
      revokedAt: key.revokedAt,
      environment: key.environment,
      permissions: key.permissionIds,
      roles: key.roleIds,
    };
  },
});

export const getKeysByOwner = query({
  args: {
    ownerId: v.string(),
  },
  returns: v.array(v.object({
    keyId: v.string(),
    hint: v.string(),
    namespace: v.string(),
    ownerId: v.string(),
    name: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    enabled: v.boolean(),
    revokedAt: v.optional(v.number()),
    environment: v.optional(v.string()),
    permissions: v.array(v.string()),
    roles: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("keys")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    return keys.map(k => ({
      keyId: k._id.toString(),
      hint: k.hint,
      namespace: k.namespace,
      ownerId: k.ownerId,
      name: k.name,
      meta: k.meta,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      expires: k.expires,
      remaining: k.remaining,
      enabled: k.enabled,
      revokedAt: k.revokedAt,
      environment: k.environment,
      permissions: k.permissionIds,
      roles: k.roleIds,
    }));
  },
});
