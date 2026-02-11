import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { generateKey, hashKey, generateHint, extractPrefix } from "./crypto.js";
import type {
  CreateKeyArgs,
  CreateKeyResult,
  VerifyKeyArgs,
  VerificationResult,
  RevokeKeyArgs,
  UpdateKeyArgs,
  RotateKeyArgs,
  OutcomeCode,
} from "./types.js";

/*
(1.) Core API key management functions implementing create, verify, revoke, update, and rotate operations.
(2.) All key operations use SHA-256 hashing to ensure plaintext keys never persist in the database.
(3.) Verification function performs atomic checks for expiration, revocation, rate limits, and usage credits.
(4.) Rate limiting uses sliding window algorithm with concurrent request handling via optimistic concurrency.
(5.) Audit logging captures every operation for compliance and debugging purposes.
(6.) Key rotation supports grace periods where both old and new keys remain valid temporarily.

This module implements the core security-critical operations for API key lifecycle management.
The create function generates cryptographically secure keys, hashes them, and stores only the
hash with metadata. The verify function performs comprehensive validation checks in a single
database transaction, including rate limit enforcement and usage credit decrementing. All
operations are atomic and handle concurrent requests correctly via Convex's optimistic
concurrency control. The audit trail ensures every operation is logged with actor information
and detailed context for security auditing and debugging.
*/

// ── Key Creation ──────────────────────────────────────────

export const create = mutation({
  args: {
    ownerId: v.string(),
    name: v.optional(v.string()),
    meta: v.optional(v.any()),
    prefix: v.optional(v.string()),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    refill: v.optional(v.object({
      amount: v.number(),
      interval: v.string(),
    })),
    ratelimit: v.optional(v.object({
      limit: v.number(),
      duration: v.number(),
    })),
    roles: v.optional(v.array(v.string())),
    permissions: v.optional(v.array(v.string())),
    environment: v.optional(v.string()),
    namespace: v.optional(v.string()),
  },
  returns: v.object({
    key: v.string(),
    keyId: v.string(),
  }),
  handler: async (ctx, args): Promise<CreateKeyResult> => {
    const prefix = args.prefix || "sk_";
    const namespace = args.namespace || "default";
    const now = Date.now();

    const plaintext = generateKey(prefix, 32);
    const hash = await hashKey(plaintext);
    const hint = generateHint(plaintext);

    const refillData = args.refill ? {
      amount: args.refill.amount,
      interval: args.refill.interval,
      lastRefill: now,
    } : undefined;

    const ratelimitData = args.ratelimit ? {
      limit: args.ratelimit.limit,
      duration: args.ratelimit.duration,
      type: "sliding_window",
    } : undefined;

    const keyId = await ctx.db.insert("keys", {
      hash,
      prefix,
      hint,
      namespace,
      ownerId: args.ownerId,
      name: args.name || "Untitled Key",
      meta: args.meta,
      createdAt: now,
      updatedAt: now,
      expires: args.expires,
      remaining: args.remaining,
      refill: refillData,
      ratelimit: ratelimitData,
      enabled: true,
      permissionIds: args.permissions || [],
      roleIds: args.roles || [],
      environment: args.environment,
    });

    await ctx.db.insert("auditLog", {
      action: "key.created",
      actorId: args.ownerId,
      targetKeyHash: hash,
      timestamp: now,
      details: {
        keyId: keyId.toString(),
        namespace,
        environment: args.environment,
      },
    });

    return {
      key: plaintext,
      keyId: keyId.toString(),
    };
  },
});

// ── Key Verification ──────────────────────────────────────────

export const verify = mutation({
  args: {
    key: v.string(),
    tags: v.optional(v.any()),
    ip: v.optional(v.string()),
    namespace: v.optional(v.string()),
  },
  returns: v.object({
    valid: v.boolean(),
    code: v.string(),
    keyId: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    meta: v.optional(v.any()),
    remaining: v.optional(v.number()),
    ratelimit: v.optional(v.object({
      remaining: v.number(),
      reset: v.number(),
    })),
    permissions: v.array(v.string()),
    roles: v.array(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<VerificationResult> => {
    const now = Date.now();
    const hash = await hashKey(args.key);

    const keyRecord = await ctx.db
      .query("keys")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .first();

    if (!keyRecord) {
      await ctx.db.insert("verificationLogs", {
        keyHash: hash,
        timestamp: now,
        success: false,
        code: "NOT_FOUND",
        tags: args.tags,
        ip: args.ip,
      });

      return {
        valid: false,
        code: "NOT_FOUND",
        permissions: [],
        roles: [],
        message: "API key not found",
      };
    }

    if (!keyRecord.enabled) {
      await logVerification(ctx, hash, false, "DISABLED", keyRecord, args);
      return {
        valid: false,
        code: "DISABLED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key is disabled",
      };
    }

    if (keyRecord.revokedAt) {
      await logVerification(ctx, hash, false, "REVOKED", keyRecord, args);
      return {
        valid: false,
        code: "REVOKED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key has been revoked",
      };
    }

    if (keyRecord.expires && keyRecord.expires < now) {
      await logVerification(ctx, hash, false, "EXPIRED", keyRecord, args);
      return {
        valid: false,
        code: "EXPIRED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key has expired",
      };
    }

    if (keyRecord.rotationGraceEnd && keyRecord.rotationGraceEnd < now) {
      await logVerification(ctx, hash, false, "ROTATION_GRACE_EXPIRED", keyRecord, args);
      return {
        valid: false,
        code: "ROTATION_GRACE_EXPIRED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        permissions: [],
        roles: [],
        message: "API key rotation grace period has expired",
      };
    }

    if (keyRecord.remaining !== undefined && keyRecord.remaining <= 0) {
      await logVerification(ctx, hash, false, "USAGE_EXCEEDED", keyRecord, args);
      return {
        valid: false,
        code: "USAGE_EXCEEDED",
        keyId: keyRecord._id.toString(),
        ownerId: keyRecord.ownerId,
        remaining: 0,
        permissions: [],
        roles: [],
        message: "API key usage limit exceeded",
      };
    }

    if (keyRecord.ratelimit) {
      const rateLimitCheck = await checkAndUpdateRateLimit(
        ctx,
        hash,
        keyRecord.namespace,
        keyRecord.ratelimit.limit,
        keyRecord.ratelimit.duration,
        now
      );

      if (!rateLimitCheck.success) {
        await logVerification(ctx, hash, false, "RATE_LIMITED", keyRecord, args, rateLimitCheck.remaining);
        return {
          valid: false,
          code: "RATE_LIMITED",
          keyId: keyRecord._id.toString(),
          ownerId: keyRecord.ownerId,
          ratelimit: {
            remaining: rateLimitCheck.remaining,
            reset: rateLimitCheck.reset,
          },
          permissions: [],
          roles: [],
          message: "Rate limit exceeded",
        };
      }
    }

    let newRemaining = keyRecord.remaining;
    if (keyRecord.remaining !== undefined) {
      newRemaining = keyRecord.remaining - 1;
      await ctx.db.patch(keyRecord._id, {
        remaining: newRemaining,
        updatedAt: now,
      });
    }

    const permissions = await resolvePermissions(ctx, keyRecord.permissionIds, keyRecord.roleIds);

    await logVerification(ctx, hash, true, "VALID", keyRecord, args, undefined, newRemaining);

    return {
      valid: true,
      code: "VALID",
      keyId: keyRecord._id.toString(),
      ownerId: keyRecord.ownerId,
      meta: keyRecord.meta,
      remaining: newRemaining,
      permissions,
      roles: keyRecord.roleIds,
      message: "API key is valid",
    };
  },
});

// ── Helper Functions ──────────────────────────────────────────

async function logVerification(
  ctx: any,
  keyHash: string,
  success: boolean,
  code: OutcomeCode,
  keyRecord: any,
  args: VerifyKeyArgs,
  rateLimitRemaining?: number,
  remaining?: number
) {
  await ctx.db.insert("verificationLogs", {
    keyHash,
    timestamp: Date.now(),
    success,
    code,
    remaining,
    rateLimitRemaining,
    tags: args.tags,
    ip: args.ip,
  });
}

async function checkAndUpdateRateLimit(
  ctx: any,
  identifier: string,
  namespace: string,
  limit: number,
  duration: number,
  now: number
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const bucket = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_key_namespace", (q: any) =>
      q.eq("keyOrOwnerId", identifier).eq("namespace", namespace)
    )
    .first();

  const windowStart = now - duration;

  if (!bucket) {
    await ctx.db.insert("rateLimitBuckets", {
      keyOrOwnerId: identifier,
      namespace,
      windowStart: now,
      count: 1,
      limit,
      duration,
    });

    return {
      success: true,
      remaining: limit - 1,
      reset: now + duration,
    };
  }

  if (bucket.windowStart < windowStart) {
    await ctx.db.patch(bucket._id, {
      windowStart: now,
      count: 1,
    });

    return {
      success: true,
      remaining: limit - 1,
      reset: now + duration,
    };
  }

  if (bucket.count >= limit) {
    return {
      success: false,
      remaining: 0,
      reset: bucket.windowStart + duration,
    };
  }

  await ctx.db.patch(bucket._id, {
    count: bucket.count + 1,
  });

  return {
    success: true,
    remaining: limit - bucket.count - 1,
    reset: bucket.windowStart + duration,
  };
}

async function resolvePermissions(
  ctx: any,
  permissionIds: string[],
  roleIds: string[]
): Promise<string[]> {
  const permissions = new Set<string>(permissionIds);

  for (const roleId of roleIds) {
    const role = await ctx.db
      .query("roles")
      .filter((q: any) => q.eq(q.field("_id"), roleId))
      .first();

    if (role) {
      role.permissionIds.forEach((p: string) => permissions.add(p));
    }
  }

  return Array.from(permissions);
}

// ── Key Revocation ──────────────────────────────────────────

export const revoke = mutation({
  args: {
    keyId: v.string(),
    soft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await ctx.db.get(args.keyId as any);

    if (!keyRecord) {
      throw new Error("Key not found");
    }

    if (args.soft === false) {
      await ctx.db.delete(args.keyId as any);
    } else {
      await ctx.db.patch(args.keyId as any, {
        revokedAt: now,
        enabled: false,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "key.revoked",
      targetKeyHash: (keyRecord as any).hash,
      timestamp: now,
      details: {
        soft: args.soft !== false,
      },
    });
  },
});

// ── Key Update ──────────────────────────────────────────

export const update = mutation({
  args: {
    keyId: v.string(),
    name: v.optional(v.string()),
    meta: v.optional(v.any()),
    expires: v.optional(v.union(v.number(), v.null())),
    remaining: v.optional(v.number()),
    ratelimit: v.optional(v.object({
      limit: v.number(),
      duration: v.number(),
    })),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyRecord = await ctx.db.get(args.keyId as any);

    if (!keyRecord) {
      throw new Error("Key not found");
    }

    const updates: any = {
      updatedAt: now,
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.meta !== undefined) updates.meta = args.meta;
    if (args.expires !== undefined) updates.expires = args.expires;
    if (args.remaining !== undefined) updates.remaining = args.remaining;
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    
    if (args.ratelimit !== undefined) {
      updates.ratelimit = {
        limit: args.ratelimit.limit,
        duration: args.ratelimit.duration,
        type: "sliding_window",
      };
    }

    await ctx.db.patch(args.keyId as any, updates);

    await ctx.db.insert("auditLog", {
      action: "key.updated",
      targetKeyHash: (keyRecord as any).hash,
      timestamp: now,
      details: updates,
    });
  },
});

// ── Key Rotation ──────────────────────────────────────────

export const rotate = mutation({
  args: {
    keyId: v.string(),
    gracePeriodMs: v.optional(v.number()),
  },
  returns: v.object({
    key: v.string(),
    keyId: v.string(),
  }),
  handler: async (ctx, args): Promise<CreateKeyResult> => {
    const now = Date.now();
    const oldKeyRecord = await ctx.db.get(args.keyId as any);

    if (!oldKeyRecord || (oldKeyRecord as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const oldKey = oldKeyRecord as any;
    const plaintext = generateKey(oldKey.prefix, 32);
    const hash = await hashKey(plaintext);
    const hint = generateHint(plaintext);

    const newKeyId = await ctx.db.insert("keys", {
      hash,
      prefix: oldKey.prefix,
      hint,
      namespace: oldKey.namespace,
      ownerId: oldKey.ownerId,
      name: oldKey.name,
      meta: oldKey.meta,
      createdAt: now,
      updatedAt: now,
      expires: oldKey.expires,
      remaining: oldKey.remaining,
      refill: oldKey.refill,
      ratelimit: oldKey.ratelimit,
      enabled: true,
      permissionIds: oldKey.permissionIds,
      roleIds: oldKey.roleIds,
      environment: oldKey.environment,
      rotatedFrom: oldKey.hash,
    });

    if (args.gracePeriodMs) {
      await ctx.db.patch(args.keyId as any, {
        rotationGraceEnd: now + args.gracePeriodMs,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.keyId as any, {
        enabled: false,
        revokedAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "key.rotated",
      targetKeyHash: oldKey.hash,
      timestamp: now,
      details: {
        newKeyId: newKeyId.toString(),
        newKeyHash: hash,
        gracePeriodMs: args.gracePeriodMs,
      },
    });

    return {
      key: plaintext,
      keyId: newKeyId.toString(),
    };
  },
});


// ── RBAC: Permissions ──────────────────────────────────────────

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

// ── RBAC: Roles ──────────────────────────────────────────

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

// ── Queries: Keys ──────────────────────────────────────────

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

// ── Queries: Analytics ──────────────────────────────────────────

export const getUsageStats = query({
  args: {
    keyId: v.string(),
    period: v.optional(v.string()),
  },
  returns: v.object({
    total: v.number(),
    valid: v.number(),
    rateLimited: v.number(),
    usageExceeded: v.number(),
    expired: v.number(),
    revoked: v.number(),
    disabled: v.number(),
    notFound: v.number(),
  }),
  handler: async (ctx, args) => {
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

    const logs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
      .collect();

    const stats = {
      total: logs.length,
      valid: 0,
      rateLimited: 0,
      usageExceeded: 0,
      expired: 0,
      revoked: 0,
      disabled: 0,
      notFound: 0,
    };

    for (const log of logs) {
      if (log.code === "VALID") stats.valid++;
      else if (log.code === "RATE_LIMITED") stats.rateLimited++;
      else if (log.code === "USAGE_EXCEEDED") stats.usageExceeded++;
      else if (log.code === "EXPIRED") stats.expired++;
      else if (log.code === "REVOKED") stats.revoked++;
      else if (log.code === "DISABLED") stats.disabled++;
      else if (log.code === "NOT_FOUND") stats.notFound++;
    }

    return stats;
  },
});

export const getOverallStats = query({
  args: {
    namespace: v.string(),
  },
  returns: v.object({
    totalKeys: v.number(),
    activeKeys: v.number(),
    disabledKeys: v.number(),
    expiredKeys: v.number(),
    revokedKeys: v.number(),
    totalVerifications: v.number(),
    successRate: v.number(),
  }),
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("keys")
      .withIndex("by_namespace", (q) => q.eq("namespace", args.namespace))
      .collect();

    const now = Date.now();
    let activeKeys = 0;
    let disabledKeys = 0;
    let expiredKeys = 0;
    let revokedKeys = 0;

    for (const key of keys) {
      if (key.revokedAt) {
        revokedKeys++;
      } else if (!key.enabled) {
        disabledKeys++;
      } else if (key.expires && key.expires < now) {
        expiredKeys++;
      } else {
        activeKeys++;
      }
    }

    const logs = await ctx.db.query("verificationLogs").collect();
    const totalVerifications = logs.length;
    const successfulVerifications = logs.filter(l => l.success).length;
    const successRate = totalVerifications > 0 ? successfulVerifications / totalVerifications : 0;

    return {
      totalKeys: keys.length,
      activeKeys,
      disabledKeys,
      expiredKeys,
      revokedKeys,
      totalVerifications,
      successRate,
    };
  },
});

export const getAuditLog = query({
  args: {
    keyId: v.optional(v.string()),
    actorId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    action: v.string(),
    actorId: v.optional(v.string()),
    targetKeyHash: v.optional(v.string()),
    timestamp: v.number(),
    details: v.optional(v.any()),
  })),
  handler: async (ctx, args) => {
    let logs: any[] = [];

    if (args.keyId) {
      const keyDoc = await ctx.db.get(args.keyId as any);
      if (keyDoc && (keyDoc as any)._tableName === "keys") {
        const key = keyDoc as any;
        logs = await ctx.db
          .query("auditLog")
          .withIndex("by_key", (q) => q.eq("targetKeyHash", key.hash))
          .order("desc")
          .take(args.limit || 100);
      }
    } else if (args.actorId) {
      logs = await ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorId", args.actorId!))
        .order("desc")
        .take(args.limit || 100);
    } else {
      logs = await ctx.db
        .query("auditLog")
        .withIndex("by_time")
        .order("desc")
        .take(args.limit || 100);
    }

    return logs.map(l => ({
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
  returns: v.array(v.object({
    keyHash: v.string(),
    timestamp: v.number(),
    success: v.boolean(),
    code: v.string(),
    remaining: v.optional(v.number()),
    rateLimitRemaining: v.optional(v.number()),
    tags: v.optional(v.any()),
    ip: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

    const logs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
      .order("desc")
      .take(args.limit || 100);

    return logs.map(l => ({
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

// ── Rate Limit Management ──────────────────────────────────────────

export const checkRateLimit = mutation({
  args: {
    identifier: v.string(),
    namespace: v.string(),
    limit: v.number(),
    duration: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    remaining: v.number(),
    reset: v.number(),
  }),
  handler: async (ctx, args) => {
    return await checkAndUpdateRateLimit(
      ctx,
      args.identifier,
      args.namespace,
      args.limit,
      args.duration,
      Date.now()
    );
  },
});

export const setRateLimitOverride = mutation({
  args: {
    keyId: v.string(),
    limit: v.number(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

    const existing = await ctx.db
      .query("rateLimitOverrides")
      .withIndex("by_key_namespace", (q) =>
        q.eq("keyOrOwnerId", key.hash).eq("namespace", key.namespace)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        limit: args.limit,
        duration: args.duration,
      });
    } else {
      await ctx.db.insert("rateLimitOverrides", {
        keyOrOwnerId: key.hash,
        namespace: key.namespace,
        limit: args.limit,
        duration: args.duration,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "ratelimit.override_set",
      targetKeyHash: key.hash,
      timestamp: now,
      details: { limit: args.limit, duration: args.duration },
    });
  },
});

export const deleteRateLimitOverride = mutation({
  args: {
    keyId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keyDoc = await ctx.db.get(args.keyId as any);

    if (!keyDoc || (keyDoc as any)._tableName !== "keys") {
      throw new Error("Key not found");
    }

    const key = keyDoc as any;

    const override = await ctx.db
      .query("rateLimitOverrides")
      .withIndex("by_key_namespace", (q) =>
        q.eq("keyOrOwnerId", key.hash).eq("namespace", key.namespace)
      )
      .first();

    if (override) {
      await ctx.db.delete(override._id);

      await ctx.db.insert("auditLog", {
        action: "ratelimit.override_deleted",
        targetKeyHash: key.hash,
        timestamp: now,
      });
    }
  },
});

export const getRateLimitOverrides = query({
  args: {
    namespace: v.string(),
  },
  returns: v.array(v.object({
    keyOrOwnerId: v.string(),
    namespace: v.string(),
    limit: v.number(),
    duration: v.number(),
  })),
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("rateLimitOverrides")
      .filter((q) => q.eq(q.field("namespace"), args.namespace))
      .collect();

    return overrides.map(o => ({
      keyOrOwnerId: o.keyOrOwnerId,
      namespace: o.namespace,
      limit: o.limit,
      duration: o.duration,
    }));
  },
});

// ── Admin: Cleanup ──────────────────────────────────────────

export const purgeExpiredKeys = mutation({
  args: {
    namespace: v.string(),
    olderThan: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = args.olderThan || now;

    const expiredKeys = await ctx.db
      .query("keys")
      .withIndex("by_namespace", (q) => q.eq("namespace", args.namespace))
      .filter((q) => q.and(
        q.neq(q.field("expires"), undefined),
        q.lt(q.field("expires"), cutoff)
      ))
      .collect();

    for (const key of expiredKeys) {
      await ctx.db.delete(key._id);
    }

    await ctx.db.insert("auditLog", {
      action: "admin.purge_expired_keys",
      timestamp: now,
      details: { namespace: args.namespace, count: expiredKeys.length },
    });

    return expiredKeys.length;
  },
});

export const purgeVerificationLogs = mutation({
  args: {
    olderThan: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const oldLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.lt("timestamp", args.olderThan))
      .collect();

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    await ctx.db.insert("auditLog", {
      action: "admin.purge_verification_logs",
      timestamp: now,
      details: { olderThan: args.olderThan, count: oldLogs.length },
    });

    return oldLogs.length;
  },
});


// ── Scheduled Functions ──────────────────────────────────────────

export const expireKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredKeys = await ctx.db
      .query("keys")
      .withIndex("by_expires")
      .filter((q) => q.and(
        q.neq(q.field("expires"), undefined),
        q.lt(q.field("expires"), now),
        q.eq(q.field("enabled"), true)
      ))
      .take(100);

    for (const key of expiredKeys) {
      await ctx.db.patch(key._id, {
        enabled: false,
        updatedAt: now,
      });
    }

    if (expiredKeys.length > 0) {
      await ctx.db.insert("auditLog", {
        action: "cron.expire_keys",
        timestamp: now,
        details: { count: expiredKeys.length },
      });
    }
  },
});

export const rollupAnalytics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const recentLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.gt("timestamp", oneHourAgo))
      .collect();

    const rollupsByKey = new Map<string, {
      namespace: string;
      valid: number;
      rateLimited: number;
      usageExceeded: number;
      expired: number;
      revoked: number;
      disabled: number;
      notFound: number;
      total: number;
    }>();

    for (const log of recentLogs) {
      const key = await ctx.db
        .query("keys")
        .withIndex("by_hash", (q) => q.eq("hash", log.keyHash))
        .first();

      const namespace = key?.namespace || "unknown";
      const keyHash = log.keyHash;

      if (!rollupsByKey.has(keyHash)) {
        rollupsByKey.set(keyHash, {
          namespace,
          valid: 0,
          rateLimited: 0,
          usageExceeded: 0,
          expired: 0,
          revoked: 0,
          disabled: 0,
          notFound: 0,
          total: 0,
        });
      }

      const stats = rollupsByKey.get(keyHash)!;
      stats.total++;

      if (log.code === "VALID") stats.valid++;
      else if (log.code === "RATE_LIMITED") stats.rateLimited++;
      else if (log.code === "USAGE_EXCEEDED") stats.usageExceeded++;
      else if (log.code === "EXPIRED") stats.expired++;
      else if (log.code === "REVOKED") stats.revoked++;
      else if (log.code === "DISABLED") stats.disabled++;
      else if (log.code === "NOT_FOUND") stats.notFound++;
    }

    const hourTimestamp = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

    for (const [keyHash, stats] of rollupsByKey) {
      const existing = await ctx.db
        .query("analyticsRollups")
        .withIndex("by_key_period", (q) =>
          q.eq("keyHash", keyHash).eq("period", "hour").eq("timestamp", hourTimestamp)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          valid: existing.valid + stats.valid,
          rateLimited: existing.rateLimited + stats.rateLimited,
          usageExceeded: existing.usageExceeded + stats.usageExceeded,
          expired: existing.expired + stats.expired,
          revoked: existing.revoked + stats.revoked,
          disabled: existing.disabled + stats.disabled,
          notFound: existing.notFound + stats.notFound,
          total: existing.total + stats.total,
        });
      } else {
        await ctx.db.insert("analyticsRollups", {
          namespace: stats.namespace,
          keyHash,
          period: "hour",
          timestamp: hourTimestamp,
          valid: stats.valid,
          rateLimited: stats.rateLimited,
          usageExceeded: stats.usageExceeded,
          expired: stats.expired,
          revoked: stats.revoked,
          disabled: stats.disabled,
          notFound: stats.notFound,
          total: stats.total,
        });
      }
    }

    if (rollupsByKey.size > 0) {
      await ctx.db.insert("auditLog", {
        action: "cron.rollup_analytics",
        timestamp: now,
        details: { keysProcessed: rollupsByKey.size, logsProcessed: recentLogs.length },
      });
    }
  },
});

export const cleanupLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const retentionDays = 90;
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;

    const oldLogs = await ctx.db
      .query("verificationLogs")
      .withIndex("by_time", (q) => q.lt("timestamp", cutoff))
      .take(1000);

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    if (oldLogs.length > 0) {
      await ctx.db.insert("auditLog", {
        action: "cron.cleanup_logs",
        timestamp: now,
        details: { count: oldLogs.length, cutoff },
      });
    }
  },
});
