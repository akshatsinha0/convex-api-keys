# Convex API Keys

[![npm version](https://badge.fury.io/js/@00akshatsinha00%2Fconvex-api-keys.svg)](https://badge.fury.io/js/@00akshatsinha00%2Fconvex-api-keys)

A native, zero-dependency Convex component for API key management. Handles key generation, SHA-256 hashing, verification, rate limiting, RBAC, usage credits, and audit logging -- all within Convex's transactional guarantees.

Found a bug? Feature request? [File it here](https://github.com/akshatsinha0/convex-api-keys/issues).

## Why This Component?

Most API key solutions require external services, webhook plumbing, and separate databases. This component runs entirely inside Convex, giving you:

- **Transactional verification** -- key lookup, rate limit check, credit decrement, and audit log write all happen in a single atomic mutation
- **Reactive dashboards** -- use Convex queries to build real-time key usage dashboards that update automatically
- **Zero infrastructure** -- no Redis for rate limiting, no separate analytics pipeline, no webhook endpoints to maintain
- **Component isolation** -- all data lives in the component's private tables; your app tables stay clean

## Features

- Cryptographically secure key generation (256-bit entropy, base62 encoded)
- SHA-256 hashed storage (plaintext keys never persist)
- Sliding window rate limiting with per-key overrides
- Usage credits with automatic refill (hourly/daily/weekly/monthly)
- Role-based access control (RBAC) with permissions and roles
- Key rotation with configurable grace periods
- Comprehensive audit logging
- Real-time reactive queries for dashboards
- Analytics rollups for usage reporting
- Multi-tenant support via namespaces and owner isolation

## Installation

```sh
npm install @00akshatsinha00/convex-api-keys
```

Register the component in your `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import apiKeys from "@00akshatsinha00/convex-api-keys/convex.config";

const app = defineApp();
app.use(apiKeys, { name: "apiKeys" });
export default app;
```

## Quick Start

### Direct component access

```ts
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const createKey = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;
    return await ctx.runMutation(components.apiKeys.lib.create, {
      ownerId: userId,
      name: args.name,
      namespace: "default",
    });
  },
});

export const verifyKey = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.apiKeys.lib.verify, {
      key: args.key,
    });
  },
});
```

### Client SDK (class-based)

```ts
import { ApiKeys, hasPermission } from "@00akshatsinha00/convex-api-keys";
import { components } from "./_generated/api";

const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "production",
  defaultPrefix: "sk_live_",
});

export const createKey = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;
    return await apiKeys.create(ctx, { ownerId: userId, name: args.name });
  },
});

export const verifyKey = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const result = await apiKeys.verify(ctx, { key: args.key });
    if (result.valid && hasPermission(result, "write:data")) {
      // authorized
    }
    return result;
  },
});
```

---

## Real-World Scenarios

### Scenario 1: SaaS API with Tiered Plans

You run a SaaS product and want to issue API keys to customers on different pricing tiers. Free users get 100 requests/day, Pro users get 10,000, and Enterprise gets unlimited.

```ts
// convex/apiKeyManager.ts
import { ApiKeys } from "@00akshatsinha00/convex-api-keys";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "api-v1",
  defaultPrefix: "sk_live_",
});

// Issue a key when a customer signs up or upgrades
export const issueKeyForPlan = mutation({
  args: {
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;

    const planConfig = {
      free:       { remaining: 100,   refill: { amount: 100,   interval: "daily" as const } },
      pro:        { remaining: 10000, refill: { amount: 10000, interval: "daily" as const } },
      enterprise: {},  // no usage cap
    };

    const config = planConfig[args.plan];

    return await apiKeys.create(ctx, {
      ownerId: userId,
      name: `${args.plan}-key`,
      meta: { plan: args.plan },
      ...config,
      ratelimit: { limit: 60, duration: 60000 },  // 60 req/min burst protection for all tiers
    });
  },
});

// Verify on every API request
export const handleApiRequest = mutation({
  args: { key: v.string(), endpoint: v.string() },
  handler: async (ctx, args) => {
    const result = await apiKeys.verify(ctx, {
      key: args.key,
      tags: { endpoint: args.endpoint },
    });

    if (!result.valid) {
      return { error: result.code, message: result.message };
    }

    return {
      authorized: true,
      remaining: result.remaining,  // undefined for Enterprise (unlimited)
      plan: result.meta?.plan,
    };
  },
});

// Dashboard query: show customer their usage
export const myKeyUsage = query({
  args: { keyId: v.string() },
  handler: async (ctx, args) => {
    return await apiKeys.getUsageStats(ctx, { keyId: args.keyId });
    // Returns: { total, valid, rateLimited, usageExceeded, expired, revoked, disabled, notFound }
  },
});
```

### Scenario 2: Multi-Service RBAC (Microservice Gateway)

You have several internal services (billing, users, analytics) behind a gateway. Each API key should only access authorized services.

```ts
// convex/gateway.ts
import { ApiKeys, hasPermission, hasAllPermissions } from "@00akshatsinha00/convex-api-keys";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "gateway",
  defaultPrefix: "gw_",
});

// Admin: set up permissions and roles once
export const bootstrapRbac = mutation({
  handler: async (ctx) => {
    // Create granular permissions
    await apiKeys.createPermission(ctx, { name: "billing:read",  description: "View invoices" });
    await apiKeys.createPermission(ctx, { name: "billing:write", description: "Create charges" });
    await apiKeys.createPermission(ctx, { name: "users:read",    description: "List users" });
    await apiKeys.createPermission(ctx, { name: "users:write",   description: "Manage users" });
    await apiKeys.createPermission(ctx, { name: "analytics:read", description: "View metrics" });

    // Bundle permissions into roles
    await apiKeys.createRole(ctx, {
      name: "billing-admin",
      permissions: ["billing:read", "billing:write"],
    });
    await apiKeys.createRole(ctx, {
      name: "readonly",
      permissions: ["billing:read", "users:read", "analytics:read"],
    });
    await apiKeys.createRole(ctx, {
      name: "superadmin",
      permissions: ["billing:read", "billing:write", "users:read", "users:write", "analytics:read"],
    });
  },
});

// Issue a key with specific roles
export const issueServiceKey = mutation({
  args: { serviceName: v.string(), roles: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result = await apiKeys.create(ctx, {
      ownerId: args.serviceName,
      name: `${args.serviceName}-key`,
    });

    // Assign roles to the newly created key
    await apiKeys.assignRoles(ctx, {
      keyId: result.keyId,
      roles: args.roles,
    });

    return result;
  },
});

// Gateway: verify and check permissions per endpoint
export const routeRequest = mutation({
  args: { key: v.string(), service: v.string(), action: v.string() },
  handler: async (ctx, args) => {
    const result = await apiKeys.verify(ctx, { key: args.key });

    if (!result.valid) {
      return { status: 401, error: result.code };
    }

    const requiredPermission = `${args.service}:${args.action}`;
    if (!hasPermission(result, requiredPermission)) {
      return { status: 403, error: "INSUFFICIENT_PERMISSIONS" };
    }

    return { status: 200, keyId: result.keyId, permissions: result.permissions };
  },
});
```

### Scenario 3: Key Rotation for PCI/SOC2 Compliance

Your security policy requires rotating API keys every 90 days. You want zero-downtime rotation with a grace period so clients can migrate.

```ts
// convex/compliance.ts
import { ApiKeys, isKeyExpiringSoon, calculateExpiration } from "@00akshatsinha00/convex-api-keys";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "production",
  defaultPrefix: "sk_live_",
});

// Create key with 90-day expiry
export const createComplianceKey = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;
    return await apiKeys.create(ctx, {
      ownerId: userId,
      name: args.name,
      expires: calculateExpiration(90),  // 90 days from now
    });
  },
});

// Rotate a key with 48-hour grace period -- both old and new key work during grace
export const rotateKey = mutation({
  args: { keyId: v.string() },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;

    const key = await apiKeys.getKey(ctx, { keyId: args.keyId });
    if (!key || key.ownerId !== userId) {
      throw new Error("Unauthorized");
    }

    // Old key stays valid for 48 hours; new key is returned immediately
    return await apiKeys.rotate(ctx, {
      keyId: args.keyId,
      gracePeriodMs: 48 * 60 * 60 * 1000,  // 48 hours
    });
  },
});

// Dashboard: show keys that need rotation soon
export const keysNeedingRotation = query({
  args: {},
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;
    const keys = await apiKeys.getKeysByOwner(ctx, { ownerId: userId });

    return keys.filter((k) => isKeyExpiringSoon(k.expires, 14));  // expiring within 14 days
  },
});
```

### Scenario 4: Webhook Endpoint Protection

You expose a webhook URL that external services call. You want to rate limit incoming webhooks and track which integration sent each request.

```ts
// convex/webhooks.ts
import { ApiKeys } from "@00akshatsinha00/convex-api-keys";
import { components } from "./_generated/api";
import { httpAction, mutation } from "./_generated/server";
import { v } from "convex/values";

const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "webhooks",
  defaultPrefix: "whk_",
});

// Issue a webhook key for each integration partner
export const createWebhookKey = mutation({
  args: {
    partnerName: v.string(),
    maxPerMinute: v.number(),
  },
  handler: async (ctx, args) => {
    return await apiKeys.create(ctx, {
      ownerId: args.partnerName,
      name: `${args.partnerName}-webhook`,
      meta: { type: "webhook", partner: args.partnerName },
      ratelimit: { limit: args.maxPerMinute, duration: 60000 },
    });
  },
});

// HTTP action: receive webhook, verify key from header
export const receiveWebhook = httpAction(async (ctx, request) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing API key", { status: 401 });
  }

  const key = authHeader.slice(7);
  const result = await ctx.runMutation(components.apiKeys.lib.verify, {
    key,
    ip: request.headers.get("X-Forwarded-For") ?? undefined,
    tags: { source: "webhook", path: new URL(request.url).pathname },
  });

  if (!result.valid) {
    const status = result.code === "RATE_LIMITED" ? 429 : 401;
    return new Response(result.message, { status });
  }

  // Process the webhook payload...
  return new Response("OK", { status: 200 });
});
```

### Scenario 5: Admin Dashboard with Analytics

Build a reactive admin panel showing API key health metrics, usage breakdowns, and audit trails.

```ts
// convex/adminDashboard.ts
import { ApiKeys } from "@00akshatsinha00/convex-api-keys";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { v } from "convex/values";

const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "production",
});

// Overall health: total keys, active vs revoked, success rate
export const namespaceHealth = query({
  handler: async (ctx) => {
    return await apiKeys.getOverallStats(ctx, { namespace: "production" });
    // Returns: { totalKeys, activeKeys, disabledKeys, expiredKeys,
    //            revokedKeys, totalVerifications, successRate }
  },
});

// Per-owner usage breakdown (e.g., show each customer's consumption)
export const customerUsage = query({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    return await apiKeys.getUsageByOwner(ctx, {
      ownerId: args.ownerId,
      period: "day",
    });
  },
});

// Audit trail for compliance review
export const recentAuditEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await apiKeys.getAuditLog(ctx, { limit: args.limit ?? 50 });
    // Returns: [{ action, actorId, targetKeyHash, timestamp, details }]
  },
});

// Verification history for a specific key (useful for debugging)
export const keyVerificationHistory = query({
  args: { keyId: v.string(), since: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await apiKeys.getVerificationLog(ctx, {
      keyId: args.keyId,
      since: args.since,
      limit: 100,
    });
    // Returns: [{ keyHash, timestamp, success, code, remaining, rateLimitRemaining, tags, ip }]
  },
});
```

### Scenario 6: Scheduled Maintenance and Cleanup

Set up automatic cleanup of expired keys and old logs to keep your database lean.

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { components } from "./_generated/api";

const crons = cronJobs();

// Every hour: expire keys past their expiration date
crons.interval("expire stale keys", { hours: 1 }, components.apiKeys.lib.expireKeys, {
  namespace: "production",
});

// Every 6 hours: roll up raw verification logs into hourly analytics buckets
crons.interval("rollup analytics", { hours: 6 }, components.apiKeys.lib.rollupAnalytics, {
  namespace: "production",
  period: "hourly",
  olderThan: 6 * 60 * 60 * 1000,  // roll up logs older than 6 hours
});

// Daily: purge verification logs older than 30 days
crons.interval("cleanup old logs", { hours: 24 }, components.apiKeys.lib.cleanupLogs, {
  olderThanMs: 30 * 24 * 60 * 60 * 1000,
});

export default crons;
```

---

## API Reference

### Key Lifecycle

| Method | Type | Description |
|--------|------|-------------|
| `create` | mutation | Generate a new API key with optional credits, rate limit, and RBAC |
| `verify` | mutation | Verify a key (checks revoked, disabled, expired, grace, refill, credits, rate limit, RBAC) |
| `revoke` | mutation | Revoke a key (`soft: true` keeps record, `soft: false` deletes it) |
| `update` | mutation | Update key properties (name, meta, expiry, credits, rate limit, enabled) |
| `rotate` | mutation | Generate a replacement key with optional grace period for the old key |

#### `create` options

```ts
await apiKeys.create(ctx, {
  ownerId: "user_123",          // required: who owns this key
  name: "Production Key",       // display name (default: "API Key")
  prefix: "sk_live_",           // key prefix for visual identification
  namespace: "production",      // logical grouping / environment
  meta: { plan: "pro" },        // arbitrary metadata returned on verify
  expires: Date.now() + 90 * 24 * 60 * 60 * 1000,  // optional expiration timestamp
  remaining: 10000,             // optional usage credit cap
  refill: { amount: 10000, interval: "daily" },     // auto-refill credits
  ratelimit: { limit: 100, duration: 60000 },       // 100 req / 60s sliding window
  roles: ["admin"],             // role names to assign
  permissions: ["keys:write"],  // direct permission names to assign
  environment: "staging",       // optional environment tag
});
// Returns: { key: "sk_live_abc123...", keyId: "j57abc..." }
```

#### `verify` response

```ts
const result = await apiKeys.verify(ctx, { key, tags: { endpoint: "/api/data" }, ip: "1.2.3.4" });
// result.valid       -- boolean
// result.code        -- "VALID" | "REVOKED" | "EXPIRED" | "RATE_LIMITED" | "USAGE_EXCEEDED"
//                       | "DISABLED" | "NOT_FOUND" | "ROTATION_GRACE_EXPIRED"
// result.keyId       -- the internal key ID
// result.ownerId     -- who owns this key
// result.meta        -- the metadata you stored on create
// result.remaining   -- credits left (undefined if unlimited)
// result.ratelimit   -- { remaining, reset } if rate limited
// result.permissions -- resolved permissions (direct + role-inherited)
// result.roles       -- role IDs assigned to this key
// result.message     -- human-readable status message
```

### Queries

| Method | Type | Description |
|--------|------|-------------|
| `listKeys` | query | List keys filtered by namespace, owner, or both. Supports `limit`. |
| `getKey` | query | Get a single key's details by ID. Returns `null` if not found. |
| `getKeysByOwner` | query | Get all keys for an owner across all namespaces. |

### RBAC

| Method | Type | Description |
|--------|------|-------------|
| `createPermission` | mutation | Create a named permission (e.g., `"billing:read"`) |
| `createRole` | mutation | Create a role bundling multiple permissions |
| `assignRoles` | mutation | Replace a key's role assignments |
| `assignPermissions` | mutation | Replace a key's direct permission assignments |
| `listPermissions` | query | List all registered permissions |
| `listRoles` | query | List all registered roles with their permissions |
| `deletePermission` | mutation | Delete a permission by ID |
| `deleteRole` | mutation | Delete a role by ID |

### Analytics

| Method | Type | Description |
|--------|------|-------------|
| `getUsageStats` | query | Per-key verification breakdown (valid, rate limited, expired, etc.) |
| `getUsageByOwner` | query | Aggregated stats across all of an owner's keys |
| `getOverallStats` | query | Namespace-level health metrics (total, active, success rate) |
| `getAuditLog` | query | Audit trail with optional filtering by key or actor |
| `getVerificationLog` | query | Verification history for a specific key with time filtering |

### Rate Limiting

| Method | Type | Description |
|--------|------|-------------|
| `checkRateLimit` | mutation | Standalone rate limit check (useful outside verify flow) |
| `setRateLimitOverride` | mutation | Override a key's default rate limit (e.g., premium tier bump) |
| `deleteRateLimitOverride` | mutation | Remove an override, reverting to the key's default |
| `getRateLimitOverrides` | query | List all overrides for a namespace |

### Admin / Maintenance

| Method | Type | Description |
|--------|------|-------------|
| `purgeExpiredKeys` | mutation | Hard-delete expired keys older than a threshold |
| `purgeVerificationLogs` | mutation | Delete verification logs older than a threshold |
| `expireKeys` | internal mutation | Mark expired keys (for use with cron jobs) |
| `cleanupLogs` | internal mutation | Remove old logs (for use with cron jobs) |
| `rollupAnalytics` | internal mutation | Aggregate raw logs into hourly/daily buckets |

## Helper Functions

Stateless utilities for working with verification results. Import them directly:

```ts
import {
  hasPermission,       // Check if result includes a specific permission
  hasAnyPermission,    // Check if result includes at least one of the given permissions
  hasAllPermissions,   // Check if result includes ALL of the given permissions
  hasRole,             // Check if result includes a specific role
  isRateLimited,       // result.code === "RATE_LIMITED"
  isExpired,           // result.code === "EXPIRED"
  isRevoked,           // result.code === "REVOKED"
  formatKeyHint,       // "sk_live_...xyz1" -- safe for display in UIs
  calculateExpiration, // calculateExpiration(90) => timestamp 90 days from now
  isKeyExpiringSoon,   // true if key expires within N days (default 7)
} from "@00akshatsinha00/convex-api-keys";
```

**Usage example:**

```ts
const result = await apiKeys.verify(ctx, { key });

if (!result.valid) {
  if (isRateLimited(result)) {
    return { error: "Too many requests", retryAfter: result.ratelimit?.reset };
  }
  if (isExpired(result)) {
    return { error: "Key expired -- please rotate" };
  }
  return { error: result.message };
}

if (!hasAllPermissions(result, ["billing:read", "billing:write"])) {
  return { error: "Insufficient permissions for billing operations" };
}
```

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────┐
│                  Your Convex App                 │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Mutations  │  │ Queries  │  │ HTTP Routes  │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│        │              │               │          │
│        └──────────┬───┘───────────────┘          │
│                   │  ApiKeys SDK                 │
│                   ▼                              │
│  ┌────────────────────────────────────────────┐  │
│  │         convex-api-keys Component          │  │
│  │  ┌──────┐ ┌────────┐ ┌──────┐ ┌────────┐  │  │
│  │  │ Keys │ │ Verify │ │ RBAC │ │Analytics│  │  │
│  │  └──┬───┘ └───┬────┘ └──┬───┘ └───┬────┘  │  │
│  │     │         │         │         │        │  │
│  │     └─────────┴─────────┴─────────┘        │  │
│  │                    │                       │  │
│  │     ┌──────────────┼──────────────┐        │  │
│  │     ▼              ▼              ▼        │  │
│  │  ┌──────┐   ┌────────────┐  ┌──────────┐  │  │
│  │  │ keys │   │ vLogs/audit│  │ rateLimits│  │  │
│  │  └──────┘   └────────────┘  └──────────┘  │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Key Verification Flow

Every `verify()` call executes the following checks atomically in a single Convex mutation:

```
Client Request
      │
      ▼
┌─────────────┐    ┌──────────────┐
│ verify(key) │───▶│ SHA-256 Hash │
└─────────────┘    └──────┬───────┘
                          ▼
                   ┌──────────────┐
                   │  Lookup Key  │
                   │  (by hash)   │
                   └──────┬───────┘
                          ▼
              ┌───────────────────────┐
              │   Validation Chain    │
              │  1. revoked?          │
              │  2. disabled?         │
              │  3. expired?          │
              │  4. rotation grace?   │
              │  5. refill credits?   │
              │  6. credits left?     │
              │  7. rate limit ok?    │
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │  Resolve Permissions  │
              │  direct ∪ role perms  │
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │  Decrement Credits    │
              │  Log Verification     │
              │  Return Result        │
              └───────────────────────┘
```

If any check fails, the chain short-circuits and returns immediately with the appropriate `code` (e.g., `RATE_LIMITED`, `USAGE_EXCEEDED`). Credits are only decremented on successful verification.

### Data Model

```
┌──────────┐     ┌────────────┐     ┌─────────────────┐
│   keys   │────▶│   roles    │────▶│   permissions   │
│          │     │ (roleIds)  │     │ (permissionIds) │
│ hash     │     └────────────┘     └─────────────────┘
│ ownerId  │
│ namespace│     ┌──────────────────┐
│ ratelimit│────▶│rateLimitOverrides│
│ refill   │     │ (per-key limits) │
│ remaining│     └──────────────────┘
└────┬─────┘
     │           ┌──────────────────┐
     └──────────▶│ verificationLogs │
                 │ (append-only)    │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │analyticsRollups  │
                 │ (hourly buckets) │
                 └──────────────────┘

┌──────────┐
│ auditLog │  (all mutations logged)
└──────────┘
```

**8 tables, all private to the component:**

| Table | Purpose | Key indexes |
|-------|---------|------------|
| `keys` | API key records (hashed, never plaintext) | `by_hash`, `by_owner`, `by_namespace`, `by_expires` |
| `rateLimitBuckets` | Sliding window counters | `by_key_namespace` |
| `verificationLogs` | Every verify() attempt | `by_key_time`, `by_time` |
| `analyticsRollups` | Aggregated hourly/daily stats | `by_ns_period`, `by_key_period` |
| `permissions` | Named permission entities | `by_name` |
| `roles` | Named roles bundling permissions | `by_name` |
| `rateLimitOverrides` | Per-key rate limit overrides | `by_key_namespace` |
| `auditLog` | All mutation operations | `by_time`, `by_key`, `by_actor` |

### RBAC Model

```
┌─────────┐   assignRoles   ┌───────────┐   permissions[]   ┌──────────────┐
│   Key   │─────────────────▶│   Role    │──────────────────▶│  Permission  │
│         │                  │ "admin"   │                   │ "keys:write" │
│         │  assignPerms     │ "viewer"  │                   │ "keys:read"  │
│         │─────────────────▶└───────────┘                   └──────────────┘
│         │  (direct perms)          ▲
└─────────┘                          │
                              createRole(name,
                                permissions[])

verify() → resolvePermissions():
  directPerms ∪ (roles → flatMap(role.permissions))
```

Keys can receive permissions two ways:
1. **Direct assignment** via `assignPermissions` -- useful for one-off grants
2. **Role inheritance** via `assignRoles` -- each role bundles multiple permissions

On `verify()`, the component resolves both paths and returns the merged set. The `hasPermission` / `hasAllPermissions` / `hasAnyPermission` helpers make authorization checks easy in your app code.

## Verification Outcome Codes

| Code | Meaning | When it triggers |
|------|---------|-----------------|
| `VALID` | Key is valid and authorized | All checks pass |
| `NOT_FOUND` | No key matches the provided value | Hash not in database |
| `REVOKED` | Key has been revoked | `revokedAt` is set |
| `DISABLED` | Key is temporarily disabled | `enabled === false` |
| `EXPIRED` | Key has passed its expiration | `expires < now` |
| `ROTATION_GRACE_EXPIRED` | Old key's grace period ended after rotation | `rotationGraceEnd < now` |
| `USAGE_EXCEEDED` | Usage credits exhausted | `remaining <= 0` |
| `RATE_LIMITED` | Too many requests in the current window | Sliding window exceeded |

## Configuration

The `ApiKeysConfig` object is passed to the `ApiKeys` constructor:

```ts
const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "production",  // auto-applied to create/verify/listKeys
  defaultPrefix: "sk_live_",      // default key prefix
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultNamespace` | `string` | `undefined` | Namespace applied when not specified in method args |
| `defaultPrefix` | `string` | `undefined` | Key prefix applied when not specified in create args |

## Security Considerations

- **Keys are hashed** with SHA-256 before storage. The plaintext key is only returned once on `create` / `rotate` and never persists.
- **Constant-time-ish lookup**: keys are looked up by hash index, not compared character by character. Timing attacks on the hash lookup are mitigated by Convex's query planner.
- **Component isolation**: all tables are private. Your app code cannot directly read the `keys` table -- access is strictly through the component's mutation/query API.
- **Audit trail**: every `create`, `revoke`, `update`, `rotate`, `assignRoles`, `assignPermissions`, `purge`, and `setRateLimitOverride` is logged to the `auditLog` table with timestamps and details.

## Exported Types

All types are exported from the package root for TypeScript consumers:

```ts
import type {
  VerificationResult,   // verify() return type
  CreateKeyResult,      // create() return type
  KeyInfo,              // getKey() / listKeys() item shape
  UsageStats,           // getUsageStats() return type
  OverallStats,         // getOverallStats() return type
  AuditEntry,           // getAuditLog() item shape
  VerificationEntry,    // getVerificationLog() item shape
  OutcomeCode,          // "VALID" | "REVOKED" | "EXPIRED" | ...
  ApiKeysConfig,        // Constructor config type
  RunMutationCtx,       // Context type for mutation methods
  RunQueryCtx,          // Context type for query methods
} from "@00akshatsinha00/convex-api-keys";
```

See more example usage in [example.ts](./example/convex/example.ts).

## Development

```sh
npm i
npm run build
npm test           # 70 tests (52 component + 14 client + 4 example)
```

## License

Apache-2.0
