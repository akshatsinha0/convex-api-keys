import { action, mutation, query } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { v } from "convex/values";
import { Auth } from "convex/server";

/*
(1.) Example usage of the API keys component demonstrating key lifecycle operations.
(2.) Shows how to create, verify, revoke, and manage API keys in a Convex app.
(3.) Includes permission checking and rate limit management examples.

This file demonstrates the typical usage patterns for the API keys component.
It shows how to integrate key management into your Convex backend functions,
including authentication checks, permission validation, and error handling.
*/

// ── Key Management ──────────────────────────────────────────

export const createApiKey = mutation({
  args: {
    name: v.optional(v.string()),
    expires: v.optional(v.number()),
    ratelimit: v.optional(v.object({
      limit: v.number(),
      duration: v.number(),
    })),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    return await ctx.runMutation(components.apiKeys.lib.create, {
      ownerId: userId,
      name: args.name || "API Key",
      expires: args.expires,
      ratelimit: args.ratelimit,
      permissions: args.permissions,
      namespace: "default",
    });
  },
});

export const verifyApiKey = mutation({
  args: {
    key: v.string(),
    endpoint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.verify, {
      key: args.key,
      tags: args.endpoint ? { endpoint: args.endpoint } : undefined,
      namespace: "default",
    });
  },
});

export const revokeApiKey = mutation({
  args: {
    keyId: v.string(),
    soft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    // Verify ownership before revoking
    const key = await ctx.runQuery(components.apiKeys.lib.getKey, {
      keyId: args.keyId,
    });
    
    if (!key || key.ownerId !== userId) {
      throw new Error("Unauthorized: You don't own this key");
    }
    
    return await ctx.runMutation(components.apiKeys.lib.revoke, {
      keyId: args.keyId,
      soft: args.soft,
    });
  },
});

export const updateApiKey = mutation({
  args: {
    keyId: v.string(),
    name: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    expires: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    const key = await ctx.runQuery(components.apiKeys.lib.getKey, {
      keyId: args.keyId,
    });
    
    if (!key || key.ownerId !== userId) {
      throw new Error("Unauthorized: You don't own this key");
    }
    
    return await ctx.runMutation(components.apiKeys.lib.update, {
      keyId: args.keyId,
      name: args.name,
      enabled: args.enabled,
      expires: args.expires,
    });
  },
});

export const rotateApiKey = mutation({
  args: {
    keyId: v.string(),
    gracePeriodMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    const key = await ctx.runQuery(components.apiKeys.lib.getKey, {
      keyId: args.keyId,
    });
    
    if (!key || key.ownerId !== userId) {
      throw new Error("Unauthorized: You don't own this key");
    }
    
    return await ctx.runMutation(components.apiKeys.lib.rotate, {
      keyId: args.keyId,
      gracePeriodMs: args.gracePeriodMs,
    });
  },
});

// ── Queries ──────────────────────────────────────────

export const listMyKeys = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    
    return await ctx.runQuery(components.apiKeys.lib.getKeysByOwner, {
      ownerId: userId,
    });
  },
});

export const getKeyDetails = query({
  args: { keyId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    const key = await ctx.runQuery(components.apiKeys.lib.getKey, {
      keyId: args.keyId,
    });
    
    if (!key || key.ownerId !== userId) {
      throw new Error("Unauthorized: You don't own this key");
    }
    
    return key;
  },
});

export const getKeyUsageStats = query({
  args: { keyId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    const key = await ctx.runQuery(components.apiKeys.lib.getKey, {
      keyId: args.keyId,
    });
    
    if (!key || key.ownerId !== userId) {
      throw new Error("Unauthorized: You don't own this key");
    }
    
    return await ctx.runQuery(components.apiKeys.lib.getUsageStats, {
      keyId: args.keyId,
    });
  },
});

// ── RBAC ──────────────────────────────────────────

export const createPermission = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // In production, add admin check here
    return await ctx.runMutation(components.apiKeys.lib.createPermission, args);
  },
});

export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // In production, add admin check here
    return await ctx.runMutation(components.apiKeys.lib.createRole, args);
  },
});

export const assignPermissionsToKey = mutation({
  args: {
    keyId: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    const key = await ctx.runQuery(components.apiKeys.lib.getKey, {
      keyId: args.keyId,
    });
    
    if (!key || key.ownerId !== userId) {
      throw new Error("Unauthorized: You don't own this key");
    }
    
    return await ctx.runMutation(components.apiKeys.lib.assignPermissions, args);
  },
});

// ── Helper Functions ──────────────────────────────────────────

async function getAuthUserId(ctx: { auth: Auth }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  // For demo purposes, use a default user ID if not authenticated
  if (!identity) {
    return "demo_user_123";
  }
  return identity.subject;
}
