import { v } from "convex/values";
import { mutation } from "../../_generated/server.js";
import { logAudit } from "../shared/auditLogger.js";
import { assertKeyExists } from "../shared/validation.js";
import type { Id } from "../../_generated/dataModel.js";

/*
(1.) RBAC assignment mutations for attaching roles and permissions to API keys.
(2.) assignRoles replaces a key's role list; assignPermissions replaces its direct permission list.

This module implements the assignment side of RBAC, connecting keys to their authorization
grants. Both mutations validate key existence, atomically update the assignment, and log
the change to the audit trail.
*/

export const assignRoles = mutation({
  args: {
    keyId: v.string(),
    roles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await assertKeyExists(ctx, args.keyId);

    await ctx.db.patch(args.keyId as Id<"keys">, {
      roleIds: args.roles,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, "key.roles_assigned", {
      roles: args.roles,
    }, keyRecord.hash);
  },
});

export const assignPermissions = mutation({
  args: {
    keyId: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const keyRecord = await assertKeyExists(ctx, args.keyId);

    await ctx.db.patch(args.keyId as Id<"keys">, {
      permissionIds: args.permissions,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, "key.permissions_assigned", {
      permissions: args.permissions,
    }, keyRecord.hash);
  },
});
