import { v } from "convex/values";
import { query } from "../_generated/server.js";
import type { Id } from "../_generated/dataModel.js";
import { mapKeyToInfo } from "./shared/mapKeyToInfo.js";

/*
(1.) Query functions for retrieving key information with filtering and pagination.
(2.) listKeys supports filtering by owner or namespace; getKey returns a single key; getKeysByOwner lists all.
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
});

export const listKeys = query({
  args: {
    namespace: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(keyInfoValidator),
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

    return keys.map(mapKeyToInfo);
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
