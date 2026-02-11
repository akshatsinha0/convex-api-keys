# Convex API Keys

[![npm version](https://badge.fury.io/js/@00akshatsinha00%2Fconvex-api-keys.svg)](https://badge.fury.io/js/@00akshatsinha00%2Fconvex-api-keys)

A native, zero-dependency Convex component for API key management. Handles key generation, SHA-256 hashing, verification, rate limiting, RBAC, usage credits, and audit logging -- all within Convex's transactional guarantees.

Found a bug? Feature request? [File it here](https://github.com/akshatsinha0/convex-api-keys/issues).

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

## API Reference

### Key Lifecycle

| Method | Type | Description |
|--------|------|-------------|
| `create` | mutation | Generate a new API key |
| `verify` | mutation | Verify a key (checks expiration, rate limits, credits, RBAC) |
| `revoke` | mutation | Revoke a key (soft or hard delete) |
| `update` | mutation | Update key properties |
| `rotate` | mutation | Rotate a key with optional grace period |

### Queries

| Method | Type | Description |
|--------|------|-------------|
| `listKeys` | query | List keys by namespace or owner |
| `getKey` | query | Get a single key's details |
| `getKeysByOwner` | query | Get all keys for an owner |

### RBAC

| Method | Type | Description |
|--------|------|-------------|
| `createPermission` | mutation | Create a named permission |
| `createRole` | mutation | Create a role with permissions |
| `assignRoles` | mutation | Assign roles to a key |
| `assignPermissions` | mutation | Assign permissions to a key |
| `listPermissions` | query | List all permissions |
| `listRoles` | query | List all roles |

### Analytics

| Method | Type | Description |
|--------|------|-------------|
| `getUsageStats` | query | Per-key verification statistics |
| `getUsageByOwner` | query | Aggregated stats across an owner's keys |
| `getOverallStats` | query | Namespace-level overview metrics |
| `getAuditLog` | query | Audit trail with filtering |
| `getVerificationLog` | query | Verification history with time filtering |

### Rate Limiting

| Method | Type | Description |
|--------|------|-------------|
| `checkRateLimit` | mutation | Manual rate limit check |
| `setRateLimitOverride` | mutation | Override rate limit for a key |
| `deleteRateLimitOverride` | mutation | Remove rate limit override |
| `getRateLimitOverrides` | query | List overrides for a namespace |

### Admin

| Method | Type | Description |
|--------|------|-------------|
| `purgeExpiredKeys` | mutation | Delete expired keys |
| `purgeVerificationLogs` | mutation | Clean up old verification logs |

## Helper Functions

```ts
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  isRateLimited,
  isExpired,
  isRevoked,
  calculateExpiration,
  isKeyExpiringSoon,
} from "@00akshatsinha00/convex-api-keys";
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
              │  revoked → disabled   │
              │  → expired → grace    │
              │  → refill → credits   │
              │  → rate limit         │
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │  Resolve Permissions  │
              │  (roles → perms)      │
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │  Log Verification     │
              │  Return Result        │
              └───────────────────────┘
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

See more example usage in [example.ts](./example/convex/example.ts).

## Development

```sh
npm i
npm run dev
npm test
```

## License

Apache-2.0
