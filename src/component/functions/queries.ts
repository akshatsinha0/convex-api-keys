import { v } from "convex/values";
import { query } from "../_generated/server.js";
import type { Id } from "../_generated/dataModel.js";
import { mapKeyToInfo } from "./shared/mapKeyToInfo.js";

/*
(1.) Query functions for retrieving key information with cursor-based pagination.
(2.) listKeys supports filtering by owner or namespace with cursor for paginated results.
(3.) All queries use shared mapKeyToInfo to eliminate the 15-field mapping duplication.

This module implements read-only query functions for accessing key data. All queries are
reactive via Convex subscriptions, enabling real-time dashboard updates. The shared
mapKeyToInfo utility ensures consistent field mapping across all key-returning endpoints.
*/

const keyInfoValidator = v.object({
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
  unkeyKeyId: v.optional(v.string()),
});

export const listKeys = query({
  args: {
    namespace: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    keys: v.array(keyInfoValidator),
    cursor: v.optional(v.string()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const numItems = args.limit || 100;

    let queryBuilder;
    if (args.ownerId) {
      queryBuilder = ctx.db
        .query("keys")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId!));
    } else if (args.namespace) {
      queryBuilder = ctx.db
        .query("keys")
        .withIndex("by_namespace", (q) => q.eq("namespace", args.namespace!));
    } else {
      queryBuilder = ctx.db.query("keys");
    }

    const result = await queryBuilder.paginate({
      numItems,
      cursor: args.cursor ?? null,
    });

    return {
      keys: result.page.map(mapKeyToInfo),
      cursor: result.isDone ? undefined : result.continueCursor,
      hasMore: !result.isDone,
    };
  },
});

export const getKey = query({
  args: { keyId: v.string() },
  returns: v.union(v.null(), keyInfoValidator),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId as Id<"keys">);
    if (!key) return null;
    return mapKeyToInfo(key);
  },
});

export const getKeysByOwner = query({
  args: { ownerId: v.string() },
  returns: v.array(keyInfoValidator),
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("keys")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    return keys.map(mapKeyToInfo);
  },
});
