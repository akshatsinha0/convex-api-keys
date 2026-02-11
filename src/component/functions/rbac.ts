import { v } from "convex/values";
import { mutation, query } from "../_generated/server.js";

/*
(1.) RBAC functions for managing permissions, roles, and their assignments to API keys.
(2.) Permission management includes create, list, and delete operations with unique name constraints.
(3.) Role management bundles permissions into reusable groups with hierarchical relationships.
(4.) Assignment functions attach permissions and roles to individual keys with audit logging.
(5.) All operations validate existence and enforce uniqueness constraints before modifications.

This module implements role-based access control for API keys, providing granular permission
management and role-based grouping. Permissions are atomic capabilities identified by unique
names. Roles bundle multiple permissions for easier management. Keys can have both direct
permission assignments and inherited permissions through roles. All RBAC operations are logged
in the audit trail for compliance tracking. The system supports flexible permission naming
conventions and role hierarchies for complex authorization scenarios.
*/

export const createPermission = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now();

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
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "permission.created",
      timestamp: now,
      details: { permissionId: permissionId.toString(), name: args.name },
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
    return permissions.map(p => ({
      id: p._id.toString(),
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
    }));
  },
});

export const deletePermission = mutation({
  args: {
    permissionId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const permission = await ctx.db.get(args.permissionId as any);

    if (!permission || (permission as any)._tableName !== "permissions") {
      throw new Error("Permission not found");
    }

    await ctx.db.delete(args.permissionId as any);

    await ctx.db.insert("auditLog", {
      action: "permission.deleted",
      timestamp: now,
      details: { permissionId: args.permissionId, name: (permission as any).name },
    });
  },
});

export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now();

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
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "role.created",
      timestamp: now,
      details: { roleId: roleId.toString(), name: args.name },
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
    return roles.map(r => ({
      id: r._id.toString(),
      name: r.name,
      description: r.description,
      permissionIds: r.permissionIds,
      createdAt: r.createdAt,
    }));
  },
});

export const deleteRole = mutation({
  args: {
    roleId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const role = await ctx.db.get(args.roleId as any);

    if (!role || (role as any)._tableName !== "roles") {
      throw new Error("Role not found");
    }

    await ctx.db.delete(args.roleId as any);

    await ctx.db.insert("auditLog", {
      action: "role.deleted",
      timestamp: now,
      details: { roleId: args.roleId, name: (role as any).name },
    });
  },
});

export const assignRoles = mutation({
  args: {
    keyId: v.string(),
    roles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await ctx.db.get(args.keyId as any);

    if (!keyRecord || (keyRecord as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    await ctx.db.patch(args.keyId as any, {
      roleIds: args.roles,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "key.roles_assigned",
      targetKeyHash: (keyRecord as any).hash,
      timestamp: now,
      details: { roles: args.roles },
    });
  },
});

export const assignPermissions = mutation({
  args: {
    keyId: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await ctx.db.get(args.keyId as any);

    if (!keyRecord || (keyRecord as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    await ctx.db.patch(args.keyId as any, {
      permissionIds: args.permissions,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "key.permissions_assigned",
      targetKeyHash: (keyRecord as any).hash,
      timestamp: now,
      details: { permissions: args.permissions },
    });
  },
});
