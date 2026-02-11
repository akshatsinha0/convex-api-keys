import { mutation, query } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { v } from "convex/values";
import { Auth } from "convex/server";

// ── Key Management ──────────────────────────────────────────

export const createApiKey = mutation({
  args: {
    name: v.optional(v.string()),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    ratelimit: v.optional(v.object({
      limit: v.number(),
      duration: v.number(),
    })),
    permissions: v.optional(v.array(v.string())),
    roles: v.optional(v.array(v.string())),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    return await ctx.runMutation(components.apiKeys.lib.create, {
      ownerId: userId,
      name: args.name || "API Key",
      expires: args.expires,
      remaining: args.remaining,
      ratelimit: args.ratelimit,
      permissions: args.permissions,
      roles: args.roles,
      environment: args.environment,
      namespace: "default",
    });
  },
});

export const verifyApiKey = mutation({
  args: {
    key: v.string(),
    endpoint: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.verify, {
      key: args.key,
      tags: args.endpoint ? { endpoint: args.endpoint } : undefined,
      ip: args.ip,
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
    remaining: v.optional(v.number()),
    ratelimit: v.optional(v.object({ limit: v.number(), duration: v.number() })),
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
      remaining: args.remaining,
      ratelimit: args.ratelimit,
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

export const listAllKeys = query({
  handler: async (ctx) => {
    return await ctx.runQuery(components.apiKeys.lib.listKeys, {
      namespace: "default",
      limit: 200,
    });
  },
});

export const getKeyDetails = query({
  args: { keyId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.apiKeys.lib.getKey, {
      keyId: args.keyId,
    });
  },
});

export const getKeyUsageStats = query({
  args: { keyId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.apiKeys.lib.getUsageStats, {
      keyId: args.keyId,
    });
  },
});

export const getOverviewStats = query({
  handler: async (ctx) => {
    return await ctx.runQuery(components.apiKeys.lib.getOverallStats, {
      namespace: "default",
    });
  },
});

export const getMyUsageStats = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return await ctx.runQuery(components.apiKeys.lib.getUsageByOwner, {
      ownerId: userId,
    });
  },
});

export const getAuditLog = query({
  args: {
    keyId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.apiKeys.lib.getAuditLog, {
      keyId: args.keyId,
      limit: args.limit || 50,
    });
  },
});

export const getVerificationLog = query({
  args: {
    keyId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.apiKeys.lib.getVerificationLog, {
      keyId: args.keyId,
      limit: args.limit || 100,
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
    return await ctx.runMutation(components.apiKeys.lib.createPermission, args);
  },
});

export const deletePermission = mutation({
  args: { permissionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.deletePermission, args);
  },
});

export const listPermissions = query({
  handler: async (ctx) => {
    return await ctx.runQuery(components.apiKeys.lib.listPermissions, {});
  },
});

export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.createRole, args);
  },
});

export const deleteRole = mutation({
  args: { roleId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.deleteRole, args);
  },
});

export const listRoles = query({
  handler: async (ctx) => {
    return await ctx.runQuery(components.apiKeys.lib.listRoles, {});
  },
});

export const assignPermissionsToKey = mutation({
  args: {
    keyId: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.assignPermissions, args);
  },
});

export const assignRolesToKey = mutation({
  args: {
    keyId: v.string(),
    roles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.assignRoles, args);
  },
});

// ── Helper Functions ──────────────────────────────────────────

async function getAuthUserId(ctx: { auth: Auth }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return "demo_user_123";
  }
  return identity.subject;
}
