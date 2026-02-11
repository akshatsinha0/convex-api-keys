import { v } from "convex/values";
import { mutation, query } from "../../_generated/server.js";
import { logAudit } from "../shared/auditLogger.js";
import type { Id } from "../../_generated/dataModel.js";

/*
(1.) Role CRUD operations: create, list, and delete roles that bundle permissions.
(2.) Roles group multiple permissions for easier assignment to API keys.

This module manages role entities within the RBAC system. Roles provide a
convenient abstraction for grouping related permissions (e.g., an "admin" role
bundling "keys:write", "keys:read", "keys:delete"). Name uniqueness is enforced.
*/

export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      throw new Error(`Role "${args.name}" already exists`);
    }

    const roleId = await ctx.db.insert("roles", {
      name: args.name,
      description: args.description,
      permissionIds: args.permissions,
      createdAt: Date.now(),
    });

    await logAudit(ctx, "role.created", {
      roleId: roleId.toString(), name: args.name,
    });

    return roleId.toString();
  },
});

export const listRoles = query({
  args: {},
  returns: v.array(v.object({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    permissionIds: v.array(v.string()),
    createdAt: v.number(),
  })),
  handler: async (ctx) => {
    const roles = await ctx.db.query("roles").collect();
    return roles.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      description: r.description,
      permissionIds: r.permissionIds,
      createdAt: r.createdAt,
    }));
  },
});

export const deleteRole = mutation({
  args: { roleId: v.string() },
  handler: async (ctx, args) => {
    const role = await ctx.db.get(args.roleId as Id<"roles">);
    if (!role) {
      throw new Error("Role not found");
    }

    await ctx.db.delete(args.roleId as Id<"roles">);
    await logAudit(ctx, "role.deleted", {
      roleId: args.roleId, name: role.name,
    });
  },
});
