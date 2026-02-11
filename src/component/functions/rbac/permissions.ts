import { v } from "convex/values";
import { mutation, query } from "../../_generated/server.js";
import { logAudit } from "../shared/auditLogger.js";
import type { Id } from "../../_generated/dataModel.js";

/*
(1.) Permission CRUD operations: create, list, and delete named permissions.
(2.) Permissions are atomic capabilities identified by unique names (e.g., "keys:write").

This module manages the permission entities within the RBAC system. Permissions
represent individual capabilities that can be assigned directly to keys or
bundled into roles. Name uniqueness is enforced at creation time.
*/

export const createPermission = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      throw new Error(`Permission "${args.name}" already exists`);
    }

    const permissionId = await ctx.db.insert("permissions", {
      name: args.name,
      description: args.description,
      createdAt: Date.now(),
    });

    await logAudit(ctx, "permission.created", {
      permissionId: permissionId.toString(), name: args.name,
    });

    return permissionId.toString();
  },
});

export const listPermissions = query({
  args: {},
  returns: v.array(v.object({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
  })),
  handler: async (ctx) => {
    const permissions = await ctx.db.query("permissions").collect();
    return permissions.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
    }));
  },
});

export const deletePermission = mutation({
  args: { permissionId: v.string() },
  handler: async (ctx, args) => {
    const permission = await ctx.db.get(args.permissionId as Id<"permissions">);
    if (!permission) {
      throw new Error("Permission not found");
    }

    await ctx.db.delete(args.permissionId as Id<"permissions">);
    await logAudit(ctx, "permission.deleted", {
      permissionId: args.permissionId, name: permission.name,
    });
  },
});
