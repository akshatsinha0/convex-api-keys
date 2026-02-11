/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.apiKeys`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.lib.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          ownerId: string;
          name?: string;
          meta?: any;
          prefix?: string;
          expires?: number;
          remaining?: number;
          refill?: { amount: number; interval: string };
          ratelimit?: { limit: number; duration: number };
          roles?: string[];
          permissions?: string[];
          environment?: string;
          namespace?: string;
        },
        { key: string; keyId: string },
        Name
      >;
      verify: FunctionReference<
        "mutation",
        "internal",
        {
          key: string;
          tags?: any;
          ip?: string;
          namespace?: string;
        },
        {
          valid: boolean;
          code: string;
          keyId?: string;
          ownerId?: string;
          meta?: any;
          remaining?: number;
          ratelimit?: { remaining: number; reset: number };
          permissions: string[];
          roles: string[];
          message?: string;
        },
        Name
      >;
      revoke: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; soft?: boolean },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          keyId: string;
          name?: string;
          meta?: any;
          expires?: number | null;
          remaining?: number;
          ratelimit?: { limit: number; duration: number };
          enabled?: boolean;
        },
        any,
        Name
      >;
      rotate: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; gracePeriodMs?: number },
        { key: string; keyId: string },
        Name
      >;
      createPermission: FunctionReference<
        "mutation",
        "internal",
        { name: string; description?: string },
        string,
        Name
      >;
      listPermissions: FunctionReference<
        "query",
        "internal",
        Record<string, never>,
        Array<{
          id: string;
          name: string;
          description?: string;
          createdAt: number;
        }>,
        Name
      >;
      deletePermission: FunctionReference<
        "mutation",
        "internal",
        { permissionId: string },
        any,
        Name
      >;
      createRole: FunctionReference<
        "mutation",
        "internal",
        { name: string; description?: string; permissions: string[] },
        string,
        Name
      >;
      listRoles: FunctionReference<
        "query",
        "internal",
        Record<string, never>,
        Array<{
          id: string;
          name: string;
          description?: string;
          permissionIds: string[];
          createdAt: number;
        }>,
        Name
      >;
      deleteRole: FunctionReference<
        "mutation",
        "internal",
        { roleId: string },
        any,
        Name
      >;
      assignRoles: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; roles: string[] },
        any,
        Name
      >;
      assignPermissions: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; permissions: string[] },
        any,
        Name
      >;
      listKeys: FunctionReference<
        "query",
        "internal",
        { namespace?: string; ownerId?: string; limit?: number },
        Array<{
          keyId: string;
          hint: string;
          namespace: string;
          ownerId: string;
          name: string;
          meta?: any;
          createdAt: number;
          updatedAt: number;
          expires?: number;
          remaining?: number;
          enabled: boolean;
          revokedAt?: number;
          environment?: string;
          permissions: string[];
          roles: string[];
        }>,
        Name
      >;
      getKey: FunctionReference<
        "query",
        "internal",
        { keyId: string },
        {
          keyId: string;
          hint: string;
          namespace: string;
          ownerId: string;
          name: string;
          meta?: any;
          createdAt: number;
          updatedAt: number;
          expires?: number;
          remaining?: number;
          enabled: boolean;
          revokedAt?: number;
          environment?: string;
          permissions: string[];
          roles: string[];
        } | null,
        Name
      >;
      getKeysByOwner: FunctionReference<
        "query",
        "internal",
        { ownerId: string },
        Array<{
          keyId: string;
          hint: string;
          namespace: string;
          ownerId: string;
          name: string;
          meta?: any;
          createdAt: number;
          updatedAt: number;
          expires?: number;
          remaining?: number;
          enabled: boolean;
          revokedAt?: number;
          environment?: string;
          permissions: string[];
          roles: string[];
        }>,
        Name
      >;
      getUsageStats: FunctionReference<
        "query",
        "internal",
        { keyId: string; period?: string },
        {
          total: number;
          valid: number;
          rateLimited: number;
          usageExceeded: number;
          expired: number;
          revoked: number;
          disabled: number;
          notFound: number;
        },
        Name
      >;
      getUsageByOwner: FunctionReference<
        "query",
        "internal",
        { ownerId: string; period?: string },
        {
          total: number;
          valid: number;
          rateLimited: number;
          usageExceeded: number;
          expired: number;
          revoked: number;
          disabled: number;
          notFound: number;
        },
        Name
      >;
      getOverallStats: FunctionReference<
        "query",
        "internal",
        { namespace: string },
        {
          totalKeys: number;
          activeKeys: number;
          disabledKeys: number;
          expiredKeys: number;
          revokedKeys: number;
          totalVerifications: number;
          successRate: number;
        },
        Name
      >;
      getAuditLog: FunctionReference<
        "query",
        "internal",
        { keyId?: string; actorId?: string; limit?: number },
        Array<{
          action: string;
          actorId?: string;
          targetKeyHash?: string;
          timestamp: number;
          details?: any;
        }>,
        Name
      >;
      getVerificationLog: FunctionReference<
        "query",
        "internal",
        { keyId: string; limit?: number; since?: number },
        Array<{
          keyHash: string;
          timestamp: number;
          success: boolean;
          code: string;
          remaining?: number;
          rateLimitRemaining?: number;
          tags?: any;
          ip?: string;
        }>,
        Name
      >;
      checkRateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          identifier: string;
          namespace: string;
          limit: number;
          duration: number;
        },
        { success: boolean; remaining: number; reset: number },
        Name
      >;
      setRateLimitOverride: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; limit: number; duration: number },
        any,
        Name
      >;
      deleteRateLimitOverride: FunctionReference<
        "mutation",
        "internal",
        { keyId: string },
        any,
        Name
      >;
      getRateLimitOverrides: FunctionReference<
        "query",
        "internal",
        { namespace: string },
        Array<{
          keyOrOwnerId: string;
          namespace: string;
          limit: number;
          duration: number;
        }>,
        Name
      >;
      purgeExpiredKeys: FunctionReference<
        "mutation",
        "internal",
        { namespace: string; olderThan?: number },
        number,
        Name
      >;
      purgeVerificationLogs: FunctionReference<
        "mutation",
        "internal",
        { olderThan: number },
        number,
        Name
      >;
      expireKeys: FunctionReference<
        "mutation",
        "internal",
        Record<string, never>,
        any,
        Name
      >;
      rollupAnalytics: FunctionReference<
        "mutation",
        "internal",
        Record<string, never>,
        any,
        Name
      >;
      cleanupLogs: FunctionReference<
        "mutation",
        "internal",
        Record<string, never>,
        any,
        Name
      >;
    };
  };
