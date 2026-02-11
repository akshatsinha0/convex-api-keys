import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/*
(1.) Schema defines six core tables for API key management: keys, rateLimitBuckets, verificationLogs, analyticsRollups, permissions, roles, rateLimitOverrides, and auditLog.
(2.) Keys table stores SHA-256 hashed keys with metadata, never storing plaintext values for security.
(3.) Rate limiting uses separate bucket table with sliding window implementation for concurrent request handling.
(4.) Verification logs capture every key verification attempt with outcome codes and metadata.
(5.) Analytics rollups aggregate verification logs into hourly/daily summaries for efficient querying.
(6.) RBAC system uses permissions and roles tables with many-to-many relationships via ID arrays.
(7.) Audit log tracks all operations for compliance and debugging with structured action types.

This schema implements a complete API key lifecycle management system within Convex component
isolation boundaries. All tables are internal to the component and accessed only through the
exposed API. The design prioritizes security (hashed keys, no plaintext storage), performance
(indexed lookups, pre-aggregated analytics), and auditability (comprehensive logging). The
schema supports multi-tenancy via ownerId and namespace fields, enabling a single component
instance to serve multiple API products or environments. Indexes are carefully chosen to
optimize common query patterns: verification by hash, listing by owner, expiration scanning,
and time-series analytics queries.
*/

export default defineSchema({
  keys: defineTable({
    hash: v.string(),
    prefix: v.string(),
    hint: v.string(),
    namespace: v.string(),
    ownerId: v.string(),
    name: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expires: v.optional(v.number()),
    remaining: v.optional(v.number()),
    refill: v.optional(v.object({
      amount: v.number(),
      interval: v.string(),
      lastRefill: v.number(),
    })),
    ratelimit: v.optional(v.object({
      limit: v.number(),
      duration: v.number(),
      type: v.string(),
    })),
    enabled: v.boolean(),
    revokedAt: v.optional(v.number()),
    environment: v.optional(v.string()),
    permissionIds: v.array(v.string()),
    roleIds: v.array(v.string()),
    rotatedFrom: v.optional(v.string()),
    rotationGraceEnd: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_owner", ["ownerId"])
    .index("by_namespace", ["namespace"])
    .index("by_expires", ["expires"]),

  rateLimitBuckets: defineTable({
    keyOrOwnerId: v.string(),
    namespace: v.string(),
    windowStart: v.number(),
    count: v.number(),
    limit: v.number(),
    duration: v.number(),
  }).index("by_key_namespace", ["keyOrOwnerId", "namespace"]),

  verificationLogs: defineTable({
    keyHash: v.string(),
    timestamp: v.number(),
    success: v.boolean(),
    code: v.string(),
    remaining: v.optional(v.number()),
    rateLimitRemaining: v.optional(v.number()),
    tags: v.optional(v.any()),
    ip: v.optional(v.string()),
  })
    .index("by_key_time", ["keyHash", "timestamp"])
    .index("by_time", ["timestamp"]),

  analyticsRollups: defineTable({
    namespace: v.string(),
    keyHash: v.optional(v.string()),
    period: v.string(),
    timestamp: v.number(),
    valid: v.number(),
    rateLimited: v.number(),
    usageExceeded: v.number(),
    expired: v.number(),
    revoked: v.number(),
    disabled: v.number(),
    notFound: v.number(),
    total: v.number(),
  })
    .index("by_ns_period", ["namespace", "period", "timestamp"])
    .index("by_key_period", ["keyHash", "period", "timestamp"]),

  permissions: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  roles: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    permissionIds: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  rateLimitOverrides: defineTable({
    keyOrOwnerId: v.string(),
    namespace: v.string(),
    limit: v.number(),
    duration: v.number(),
  }).index("by_key_namespace", ["keyOrOwnerId", "namespace"]),

  auditLog: defineTable({
    action: v.string(),
    actorId: v.optional(v.string()),
    targetKeyHash: v.optional(v.string()),
    timestamp: v.number(),
    details: v.optional(v.any()),
  })
    .index("by_time", ["timestamp"])
    .index("by_key", ["targetKeyHash", "timestamp"])
    .index("by_actor", ["actorId", "timestamp"]),
});
