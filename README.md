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

- Cryptographically secure key generation (configurable entropy, base62 encoded)
- SHA-256 hashed storage (plaintext keys never persist)
- Sliding window rate limiting with per-key and per-owner shared overrides
- Usage credits with automatic refill (hourly/daily/weekly/monthly)
- Role-based access control (RBAC) with permissions and roles
- Key rotation with configurable grace periods
- Full audit logging with action type filtering
- Cursor-based pagination for key listings
- Real-time reactive queries for dashboards
- Analytics rollups (hourly + daily) with time-bucketed queries
- Top keys by usage ranking
- Multi-tenant support via namespaces and owner isolation
- Configurable key bytes, log retention, and rollup intervals

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
import { ApiKeys } from "@00akshatsinha00/convex-api-keys";
import { components } from "./_generated/api";

const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "production",
  defaultPrefix: "sk_live_",
  keyBytes: 32,              // configurable key entropy (default: 32)
  logRetentionDays: 90,      // auto-applied to purgeVerificationLogs
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
    // Static class methods for permission checking
    if (result.valid && ApiKeys.hasPermission(result, "write:data")) {
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

## Unkey Integration (Optional)

The component works fully standalone with zero dependencies. Optionally, you can use [Unkey](https://unkey.dev) as the key management engine while Convex provides reactive state, unlimited audit trails, and analytics rollups.

### Why use Unkey mode?

- **Battle-tested key infrastructure** -- Unkey handles key generation, verification, rate limiting at scale
- **Convex reactive layer** -- real-time dashboards, subscriptions, and audit logging on top of Unkey
- **No webhooks needed** -- Unkey has no event system; this component fills that gap with local logging
- **Same queries** -- `listKeys`, `getUsageStats`, `getAuditLog` work identically in both modes

### Installation

```sh
npm install @unkey/api
```

### Setup

```ts
import { Unkey } from "@unkey/api";
import { UnkeyApiKeys } from "@00akshatsinha00/convex-api-keys/unkey";
import { components } from "./_generated/api";

// Construct the Unkey client in your app code (components can't access process.env)
const unkeyClient = new Unkey({ rootKey: process.env.UNKEY_ROOT_KEY! });

const apiKeys = new UnkeyApiKeys(
  components.apiKeys,
  { apiId: process.env.UNKEY_API_ID!, defaultNamespace: "production" },
  unkeyClient
);
```

### Usage

Write operations (create, verify, revoke, update) must be called from **actions** since they make HTTP calls to Unkey:

```ts
import { action } from "./_generated/server";
import { v } from "convex/values";

export const createKey = action({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;
    // 1. Calls Unkey API to generate key
    // 2. Mirrors result into component tables via mutation
    return await apiKeys.create(ctx, { ownerId: userId, name: args.name });
  },
});

export const verifyKey = action({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    // 1. Calls Unkey API to verify
    // 2. Logs verification result into component tables
    return await apiKeys.verify(ctx, { key: args.key });
  },
});
```

Read operations work from queries (no Unkey call needed):

```ts
import { query } from "./_generated/server";

export const listKeys = query({
  handler: async (ctx) => {
    return await apiKeys.listKeys(ctx);
  },
});
```

### Architecture: Unkey Mode

```
Your Convex App
  │
  ├── action: apiKeys.create(ctx, args)
  │     ├── 1. Unkey SDK → keys.create() → { key, keyId }
  │     └── 2. ctx.runMutation → component.lib.importKey()
  │           └── ctx.db.insert("keys", { unkeyKeyId, hash, ... })
  │
  ├── action: apiKeys.verify(ctx, args)
  │     ├── 1. Unkey SDK → keys.verifyKey() → { valid, code, remaining }
  │     └── 2. ctx.runMutation → component.lib.logExternalVerification()
  │           └── ctx.db.insert("verificationLogs", { ... })
  │
  └── query: apiKeys.listKeys(ctx)  ← pure Convex query, no Unkey call
        └── ctx.runQuery → component.lib.listKeys()
```

### When to Use Which

| Feature | Native Mode | Unkey Mode |
|---------|-------------|------------|
| Dependencies | Zero | `@unkey/api` |
| Key generation | Convex (crypto.subtle) | Unkey API |
| Verification | Convex mutation (atomic) | Unkey API + local log |
| Rate limiting | Convex sliding window | Unkey + local mirror |
| Dashboards | Reactive queries | Reactive queries (same) |
| Audit trail | Full | Full |
| Write context | Mutation | Action (HTTP calls) |
| Latency | Single Convex call | Convex + Unkey round-trip |
| Best for | Self-contained apps | Apps already using Unkey |

---

## API Reference

### Key Lifecycle

| Method                    | Type       | Description                                                                   |
| :------------------------ | :--------- | :---------------------------------------------------------------------------- |
| `create(ctx, args)`       | `mutation` | Generate a new API key with optional credits, rate limit, RBAC, and keyBytes  |
| `verify(ctx, args)`       | `mutation` | Verify a key -- checks revoked, disabled, expired, grace, refill, credits, per-key + per-owner rate limit, RBAC |
| `revoke(ctx, args)`       | `mutation` | Revoke a key (`soft: true` keeps record, `soft: false` hard-deletes)          |
| `update(ctx, args)`       | `mutation` | Update key properties (name, meta, expiry, credits, rate limit, enabled)      |
| `rotate(ctx, args)`       | `mutation` | Generate a replacement key with optional grace period for the old key         |

#### `create` options

```ts
await apiKeys.create(ctx, {
  ownerId: "user_123",          // required: who owns this key
  name: "Production Key",       // display name (default: "Untitled Key")
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
  keyBytes: 32,                 // random bytes for key entropy (default: 32)
});
// Returns: { key: "sk_live_abc123...", keyId: "j57abc..." }
```

#### `verify` response

```ts
const result = await apiKeys.verify(ctx, { key, tags: { endpoint: "/api/data" }, ip: "1.2.3.4" });
```

| Field              | Type                              | Description                                              |
| :----------------- | :-------------------------------- | :------------------------------------------------------- |
| `valid`            | `boolean`                         | Whether the key passed all checks                        |
| `code`             | `OutcomeCode`                     | `"VALID"`, `"REVOKED"`, `"EXPIRED"`, `"RATE_LIMITED"`, `"USAGE_EXCEEDED"`, `"DISABLED"`, `"NOT_FOUND"`, `"ROTATION_GRACE_EXPIRED"` |
| `keyId`            | `string?`                         | Internal key document ID                                 |
| `ownerId`          | `string?`                         | Owner of the key                                         |
| `meta`             | `object?`                         | Metadata stored on create                                |
| `remaining`        | `number?`                         | Credits left (`undefined` if unlimited)                  |
| `ratelimit`        | `{ remaining, reset }?`           | Rate limit state (only present when rate limited)        |
| `permissions`      | `string[]`                        | Resolved permission names (direct + role-inherited)      |
| `roles`            | `string[]`                        | Resolved role names assigned to this key                 |
| `message`          | `string?`                         | Human-readable status message                            |

---

### Queries

| Method                            | Type    | Description                                                                        |
| :-------------------------------- | :------ | :--------------------------------------------------------------------------------- |
| `listKeys(ctx, args?)`            | `query` | Paginated key listing by namespace/owner. Returns `{ keys, cursor?, hasMore }`     |
| `getKey(ctx, { keyId })`          | `query` | Get a single key by ID. Returns `KeyInfo \| null`                                  |
| `getKeysByOwner(ctx, { ownerId })` | `query` | Get all keys for an owner across all namespaces                                    |

#### `listKeys` -- cursor-based pagination

```ts
// First page
const page1 = await apiKeys.listKeys(ctx, { namespace: "prod", limit: 25 });
// page1 = { keys: [...], cursor: "abc...", hasMore: true }

// Next page
const page2 = await apiKeys.listKeys(ctx, { namespace: "prod", limit: 25, cursor: page1.cursor });
// page2 = { keys: [...], cursor: undefined, hasMore: false }
```

| Arg           | Type      | Description                                     |
| :------------ | :-------- | :---------------------------------------------- |
| `namespace`   | `string?` | Filter by namespace                              |
| `ownerId`     | `string?` | Filter by owner                                  |
| `limit`       | `number?` | Page size (default: 100)                         |
| `cursor`      | `string?` | Cursor from previous `listKeys` result           |

---

### RBAC

| Method                               | Type       | Description                                         |
| :----------------------------------- | :--------- | :-------------------------------------------------- |
| `createPermission(ctx, args)`        | `mutation` | Create a named permission (e.g., `"billing:read"`)  |
| `createRole(ctx, args)`              | `mutation` | Create a role bundling multiple permissions          |
| `assignRoles(ctx, args)`             | `mutation` | Replace a key's role assignments                     |
| `assignPermissions(ctx, args)`       | `mutation` | Replace a key's direct permission assignments        |
| `listPermissions(ctx)`               | `query`    | List all registered permissions                      |
| `listRoles(ctx)`                     | `query`    | List all registered roles with their permissions     |
| `deletePermission(ctx, args)`        | `mutation` | Delete a permission by ID                            |
| `deleteRole(ctx, args)`              | `mutation` | Delete a role by ID                                  |

---

### Analytics

| Method                                    | Type    | Description                                                                                 |
| :---------------------------------------- | :------ | :------------------------------------------------------------------------------------------ |
| `getUsageStats(ctx, args)`                | `query` | Per-key verification breakdown by outcome code. Supports `period: "hour" \| "day"` for rollup data |
| `getUsageByOwner(ctx, args)`              | `query` | Aggregated stats across all of an owner's keys. Supports `period` param                     |
| `getTopKeysByUsage(ctx, args)`            | `query` | Top N keys by total verification count within a namespace (sorted descending)               |
| `getVerificationsOverTime(ctx, args)`     | `query` | Time-bucketed verification data (`{ timestamp, total, valid, failed }[]`). Filter by key or namespace |
| `getOverallStats(ctx, { namespace })`     | `query` | Namespace-level health: total/active/disabled/expired/revoked keys, success rate            |
| `getAuditLog(ctx, args?)`                 | `query` | Audit trail filterable by `keyId`, `actorId`, `actionType`, `since`, and `limit`            |
| `getVerificationLog(ctx, args)`           | `query` | Verification history for a specific key with `since` and `limit`                            |

#### `getTopKeysByUsage`

```ts
const top = await apiKeys.getTopKeysByUsage(ctx, { namespace: "prod", limit: 10 });
// [{ keyHash, keyId, name, ownerId, total, valid }]
```

#### `getVerificationsOverTime`

```ts
const buckets = await apiKeys.getVerificationsOverTime(ctx, {
  namespace: "prod",    // or keyId for per-key data
  period: "hour",       // "hour" | "day"
  since: Date.now() - 7 * 24 * 60 * 60 * 1000,  // last 7 days
});
// [{ timestamp, total, valid, failed }]
```

#### `getAuditLog` filters

```ts
await apiKeys.getAuditLog(ctx, {
  keyId: "...",           // filter by key
  actorId: "user_123",   // filter by actor
  actionType: "key.created",  // filter by action type
  since: Date.now() - 86400000,  // events after this timestamp
  limit: 50,
});
```

---

### Rate Limiting

| Method                                     | Type       | Description                                                                 |
| :----------------------------------------- | :--------- | :-------------------------------------------------------------------------- |
| `checkRateLimit(ctx, args)`                | `mutation` | Standalone rate limit check (useful outside the verify flow)                |
| `setRateLimitOverride(ctx, args)`          | `mutation` | Override a specific key's default rate limit (e.g., premium tier bump)      |
| `deleteRateLimitOverride(ctx, args)`       | `mutation` | Remove a key override, reverting to the key's default limit                 |
| `setOwnerRateLimit(ctx, args)`             | `mutation` | Set a shared rate limit across ALL keys belonging to an owner               |
| `deleteOwnerRateLimit(ctx, args)`          | `mutation` | Remove the shared owner rate limit                                          |
| `getRateLimitOverrides(ctx, { namespace })` | `query`   | List all overrides (key-level and owner-level) for a namespace              |

#### Per-owner shared rate limits

When any key owned by user X is verified, the shared owner limit for user X is decremented. This enforces a global request budget across all of an owner's keys.

```ts
// Set: user_123 can make 1000 total requests/hour across ALL their keys
await apiKeys.setOwnerRateLimit(ctx, {
  ownerId: "user_123",
  namespace: "production",
  limit: 1000,
  duration: 3600000,  // 1 hour
});

// Remove
await apiKeys.deleteOwnerRateLimit(ctx, {
  ownerId: "user_123",
  namespace: "production",
});
```

---

### Admin / Maintenance

| Method                              | Type                | Description                                                      |
| :---------------------------------- | :------------------ | :--------------------------------------------------------------- |
| `purgeExpiredKeys(ctx, args)`       | `mutation`          | Hard-delete expired keys older than a threshold                  |
| `purgeVerificationLogs(ctx, args?)` | `mutation`          | Delete old verification logs (uses `logRetentionDays` from config) |
| `expireKeys`                        | `internal mutation` | Mark expired keys as disabled (cron: every 1 hour)              |
| `cleanupLogs`                       | `internal mutation` | Remove verification logs older than 90 days (cron: every 24 hours) |
| `rollupAnalytics`                   | `internal mutation` | Aggregate raw logs into hourly buckets (cron: every 1 hour)     |
| `rollupDaily`                       | `internal mutation` | Aggregate hourly rollups into daily buckets (cron: every 24 hours) |

---

## Helper Functions

Stateless utilities for working with verification results. Available as both **standalone imports** and **static class methods**:

```ts
// Standalone imports
import {
  hasPermission,       // hasPermission(result, "billing:read") → boolean
  hasAnyPermission,    // hasAnyPermission(result, ["a", "b"]) → boolean
  hasAllPermissions,   // hasAllPermissions(result, ["a", "b"]) → boolean
  hasRole,             // hasRole(result, "admin") → boolean
  isRateLimited,       // result.code === "RATE_LIMITED"
  isExpired,           // result.code === "EXPIRED"
  isRevoked,           // result.code === "REVOKED"
  formatKeyHint,       // "sk_live_...xyz1" -- safe for display in UIs
  calculateExpiration, // calculateExpiration(90) → timestamp 90 days from now
  isKeyExpiringSoon,   // true if key expires within N days (default 7)
} from "@00akshatsinha00/convex-api-keys";

// Or use as static class methods
ApiKeys.hasPermission(result, "billing:read");
ApiKeys.hasAnyPermission(result, ["billing:read", "billing:write"]);
ApiKeys.hasAllPermissions(result, ["billing:read", "billing:write"]);
ApiKeys.hasRole(result, "admin");
```

| Helper                | Signature                                          | Description                             |
| :-------------------- | :------------------------------------------------- | :-------------------------------------- |
| `hasPermission`       | `(result, permission) → boolean`                   | Check for a single permission           |
| `hasAnyPermission`    | `(result, permissions[]) → boolean`                | At least one permission present         |
| `hasAllPermissions`   | `(result, permissions[]) → boolean`                | All permissions present                 |
| `hasRole`             | `(result, role) → boolean`                         | Check for a single role                 |
| `isRateLimited`       | `(result) → boolean`                               | `code === "RATE_LIMITED"`               |
| `isExpired`           | `(result) → boolean`                               | `code === "EXPIRED"`                    |
| `isRevoked`           | `(result) → boolean`                               | `code === "REVOKED"`                    |
| `formatKeyHint`       | `(key) → string`                                   | Redact middle of key for safe display   |
| `calculateExpiration` | `(days) → number`                                  | Timestamp N days from now               |
| `isKeyExpiringSoon`   | `(expiresAt, daysThreshold?) → boolean`            | True if expiring within threshold       |

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Your Convex App                      │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐          │
│  │ Mutations  │  │ Queries  │  │   Actions    │          │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘          │
│        │              │               │                  │
│        └──────┬───────┘     ┌─────────┘                  │
│     ApiKeys   │             │  UnkeyApiKeys (optional)   │
│     SDK       ▼             ▼                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │           convex-api-keys Component              │    │
│  │  ┌──────┐ ┌────────┐ ┌──────┐ ┌────────┐        │    │
│  │  │ Keys │ │ Verify │ │ RBAC │ │Analytics│        │    │
│  │  └──┬───┘ └───┬────┘ └──┬───┘ └───┬────┘        │    │
│  │     │         │         │         │              │    │
│  │     └─────────┴─────────┴─────────┘              │    │
│  │                    │                             │    │
│  │     ┌──────────────┼──────────────┐              │    │
│  │     ▼              ▼              ▼              │    │
│  │  ┌──────┐   ┌────────────┐  ┌──────────┐        │    │
│  │  │ keys │   │ vLogs/audit│  │ rateLimits│        │    │
│  │  └──────┘   └────────────┘  └──────────┘        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Optional: Actions ──HTTP──▶ Unkey API (external)        │
└──────────────────────────────────────────────────────────┘
```

### Key Verification Flow

Every `verify()` call runs atomically in a single Convex mutation:

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
              │  7. per-key rate ok?  │
              │  8. owner rate ok?    │
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

If any check fails, the chain short-circuits with the appropriate `code` (e.g., `RATE_LIMITED`, `USAGE_EXCEEDED`). Credits are only decremented on successful verification.

### Rate Limiting Flow

```
verify() called
      │
      ▼
┌─────────────────────────────────┐
│  Per-Key Rate Limit             │
│  ┌────────────────────────┐     │
│  │ 1. Check override for  │     │
│  │    this key's hash     │     │     rateLimitOverrides
│  │ 2. Fall back to key's  │◀────┼──── (by keyOrOwnerId)
│  │    default ratelimit   │     │
│  │ 3. checkAndUpdate      │     │     rateLimitBuckets
│  │    RateLimit(hash)     │────▶┼──── (sliding window)
│  └────────────────────────┘     │
│           │ pass                │
│           ▼                     │
│  Per-Owner Shared Rate Limit    │
│  ┌────────────────────────┐     │
│  │ 1. Check override for  │     │     rateLimitOverrides
│  │    this key's ownerId  │◀────┼──── (by keyOrOwnerId)
│  │ 2. If found, checkAnd  │     │
│  │    UpdateRateLimit     │     │     rateLimitBuckets
│  │    (ownerId)           │────▶┼──── (shared bucket)
│  └────────────────────────┘     │
│           │ pass                │
│           ▼                     │
│  Continue verification...       │
└─────────────────────────────────┘
```

### Analytics Rollup Pipeline

```
Convex Scheduler
      │
      ├── Every 1 hour: rollupAnalytics
      │     │
      │     ├── Query verificationLogs WHERE timestamp ∈ [prevHourStart, currHourStart)
      │     ├── Group by keyHash → tally outcome codes
      │     └── Upsert into analyticsRollups (period="hour")
      │
      ├── Every 24 hours: rollupDaily
      │     │
      │     ├── Query analyticsRollups WHERE period="hour" AND timestamp ∈ [prevDayStart, currDayStart)
      │     ├── Group by keyHash → sum hourly buckets
      │     └── Upsert into analyticsRollups (period="day")
      │
      └── Every 24 hours: cleanupLogs
            │
            └── Delete verificationLogs WHERE timestamp < (now - 90 days)

Dashboard queries read from:
  ┌─────────────────────┐    ┌──────────────────────┐
  │ getUsageStats       │───▶│ analyticsRollups     │ (when period specified)
  │ getUsageByOwner     │    │ (pre-aggregated)     │
  │ getOverallStats     │    └──────────────────────┘
  │ getTopKeysByUsage   │
  │ getVerifications    │    ┌──────────────────────┐
  │   OverTime          │───▶│ verificationLogs     │ (raw, when no period)
  └─────────────────────┘    │ (recent data)        │
                             └──────────────────────┘
```

### Data Model

```
┌──────────┐     ┌────────────┐     ┌─────────────────┐
│   keys   │────▶│   roles    │────▶│   permissions   │
│          │     │ (roleIds)  │     │ (permissionIds) │
│ hash     │     └────────────┘     └─────────────────┘
│ ownerId  │
│ namespace│     ┌──────────────────┐
│ ratelimit│────▶│rateLimitOverrides│
│ refill   │     │ per-key or       │
│ remaining│     │ per-owner limits │
└────┬─────┘     └──────────────────┘
     │
     │           ┌──────────────────┐
     └──────────▶│ verificationLogs │
                 │ (append-only)    │
                 └────────┬─────────┘
                          │  rollup
                          ▼
                 ┌──────────────────┐
                 │analyticsRollups  │
                 │ hourly + daily   │
                 └──────────────────┘

┌──────────────────┐
│ rateLimitBuckets │  (sliding window state)
└──────────────────┘

┌──────────┐
│ auditLog │  (all mutations logged)
└──────────┘
```

**8 tables, all private to the component:**

| Table                  | Purpose                                   | Indexes                                                     |
| :--------------------- | :---------------------------------------- | :---------------------------------------------------------- |
| `keys`                 | API key records (hashed, never plaintext) | `by_hash`, `by_owner`, `by_namespace`, `by_expires`, `by_unkey_id` |
| `rateLimitBuckets`     | Sliding window counters per key or owner  | `by_key_namespace`                                          |
| `verificationLogs`     | Every `verify()` attempt with outcome     | `by_key_time`, `by_time`                                    |
| `analyticsRollups`     | Pre-aggregated hourly and daily stats     | `by_ns_period`, `by_key_period`                             |
| `permissions`          | Named permission entities                 | `by_name`                                                   |
| `roles`                | Named roles bundling permissions          | `by_name`                                                   |
| `rateLimitOverrides`   | Per-key and per-owner rate limit overrides | `by_key_namespace`                                         |
| `auditLog`             | All mutation operations with details      | `by_time`, `by_key`, `by_actor`                             |


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

On `verify()`, the component resolves both paths and returns the merged set.

---

## Verification Outcome Codes

| Code                       | Meaning                                        | Triggered when                        |
| :------------------------- | :--------------------------------------------- | :------------------------------------ |
| `VALID`                    | Key is valid and authorized                    | All checks pass                       |
| `NOT_FOUND`                | No key matches the provided value              | Hash not in database                  |
| `REVOKED`                  | Key has been revoked                           | `revokedAt` is set                    |
| `DISABLED`                 | Key is temporarily disabled                    | `enabled === false`                   |
| `EXPIRED`                  | Key has passed its expiration                  | `expires < now`                       |
| `ROTATION_GRACE_EXPIRED`   | Old key's grace period ended after rotation    | `rotationGraceEnd < now`              |
| `USAGE_EXCEEDED`           | Usage credits exhausted                        | `remaining <= 0`                      |
| `RATE_LIMITED`             | Too many requests in the current window        | Per-key or per-owner limit exceeded   |

---

## Configuration

```ts
const apiKeys = new ApiKeys(components.apiKeys, {
  defaultNamespace: "production",
  defaultPrefix: "sk_live_",
  keyBytes: 32,
  logRetentionDays: 90,
});
```

| Option              | Type     | Default     | Description                                                     |
| :------------------ | :------- | :---------- | :-------------------------------------------------------------- |
| `defaultNamespace`  | `string` | `undefined` | Namespace auto-applied to create/verify/listKeys when not specified |
| `defaultPrefix`     | `string` | `undefined` | Key prefix auto-applied to create when not specified            |
| `keyBytes`          | `number` | `32`        | Random bytes of entropy for key generation                      |
| `logRetentionDays`  | `number` | `90`        | Used by `purgeVerificationLogs` to compute the cutoff timestamp |
| `rollupInterval`    | `number` | `3600000`   | Rollup interval in ms (informational; cron runs hourly)         |

---

## Scheduled Jobs (Crons)

The component registers these internal cron jobs automatically:

| Job                 | Interval  | Description                                                  |
| :------------------ | :-------- | :----------------------------------------------------------- |
| `expire keys`       | 1 hour    | Disables keys past their `expires` timestamp                 |
| `rollup analytics`  | 1 hour    | Aggregates verification logs into hourly `analyticsRollups`  |
| `rollup daily`      | 24 hours  | Aggregates hourly rollups into daily `analyticsRollups`      |
| `cleanup logs`      | 24 hours  | Deletes verification logs older than 90 days                 |

---

## Security Considerations

- **Keys are hashed** with SHA-256 before storage. The plaintext key is only returned once on `create` / `rotate` and never persists.
- **Constant-time-ish lookup**: keys are looked up by hash index, not compared character by character. Timing attacks on the hash lookup are mitigated by Convex's query planner.
- **Component isolation**: all tables are private. Your app code cannot directly read the `keys` table -- access is strictly through the component's mutation/query API.
- **Audit trail**: every `create`, `revoke`, `update`, `rotate`, `assignRoles`, `assignPermissions`, `purge`, and `setRateLimitOverride` is logged to the `auditLog` table with timestamps and details.

---

## Exported Types

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
  RunActionCtx,         // Context type for action methods (Unkey mode)
} from "@00akshatsinha00/convex-api-keys";

// Unkey integration types (optional)
import type { UnkeyApiKeys, UnkeyConfig } from "@00akshatsinha00/convex-api-keys/unkey";
```

See more example usage in [example.ts](./example/convex/example.ts).

---

## Development

```sh
npm i
npm run build
npm test
```

## License

Apache-2.0
