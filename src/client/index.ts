/*
(1.) Client SDK for the API keys component providing a class-based interface.
(2.) ApiKeys class wraps component function references with typed method signatures.
(3.) Re-exports helper functions and types for consumer convenience.

This module provides the primary client interface for consuming applications.
The ApiKeys class accepts a component reference and optional configuration,
then provides typed methods for all key management operations. Each method
delegates to the component's internal functions via ctx.runMutation or
ctx.runQuery, merging in default configuration values.
*/

import type { ComponentApi } from "../component/_generated/component.js";
import type { RunMutationCtx, RunQueryCtx, ApiKeysConfig, VerificationResult } from "./types.js";

export class ApiKeys {
  public component: ComponentApi;
  private config: ApiKeysConfig;

  constructor(
    component: ComponentApi,
    config?: ApiKeysConfig
  ) {
    this.component = component;
    this.config = config || {};
  }

  async create(
    ctx: RunMutationCtx,
    args: {
      ownerId: string;
      name?: string;
      meta?: Record<string, unknown>;
      prefix?: string;
      expires?: number;
      remaining?: number;
      refill?: { amount: number; interval: string };
      ratelimit?: { limit: number; duration: number };
      roles?: string[];
      permissions?: string[];
      environment?: string;
      namespace?: string;
      keyBytes?: number;
    }
  ) {
    return await ctx.runMutation(this.component.lib.create, {
      ...args,
      prefix: args.prefix || this.config.defaultPrefix,
      namespace: args.namespace || this.config.defaultNamespace,
      keyBytes: args.keyBytes || this.config.keyBytes,
    });
  }

  async verify(
    ctx: RunMutationCtx,
    args: {
      key: string;
      tags?: Record<string, unknown>;
      ip?: string;
      namespace?: string;
    }
  ) {
    return await ctx.runMutation(this.component.lib.verify, {
      ...args,
      namespace: args.namespace || this.config.defaultNamespace,
    });
  }

  async revoke(
    ctx: RunMutationCtx,
    args: { keyId: string; soft?: boolean }
  ) {
    return await ctx.runMutation(this.component.lib.revoke, args);
  }

  async update(
    ctx: RunMutationCtx,
    args: {
      keyId: string;
      name?: string;
      meta?: Record<string, unknown>;
      expires?: number | null;
      remaining?: number;
      ratelimit?: { limit: number; duration: number };
      enabled?: boolean;
    }
  ) {
    return await ctx.runMutation(this.component.lib.update, args);
  }

  async rotate(
    ctx: RunMutationCtx,
    args: { keyId: string; gracePeriodMs?: number }
  ) {
    return await ctx.runMutation(this.component.lib.rotate, args);
  }

  async listKeys(
    ctx: RunQueryCtx,
    args?: { namespace?: string; ownerId?: string; limit?: number; cursor?: string }
  ) {
    return await ctx.runQuery(this.component.lib.listKeys, {
      namespace: args?.namespace || this.config.defaultNamespace,
      ownerId: args?.ownerId,
      limit: args?.limit,
      cursor: args?.cursor,
    });
  }

  async getKey(ctx: RunQueryCtx, args: { keyId: string }) {
    return await ctx.runQuery(this.component.lib.getKey, args);
  }

  async getKeysByOwner(ctx: RunQueryCtx, args: { ownerId: string }) {
    return await ctx.runQuery(this.component.lib.getKeysByOwner, args);
  }

  async getUsageStats(
    ctx: RunQueryCtx,
    args: { keyId: string; period?: string }
  ) {
    return await ctx.runQuery(this.component.lib.getUsageStats, args);
  }

  async getUsageByOwner(
    ctx: RunQueryCtx,
    args: { ownerId: string; period?: string }
  ) {
    return await ctx.runQuery(this.component.lib.getUsageByOwner, args);
  }

  async getTopKeysByUsage(
    ctx: RunQueryCtx,
    args: { namespace: string; limit?: number }
  ) {
    return await ctx.runQuery(this.component.lib.getTopKeysByUsage, args);
  }

  async getVerificationsOverTime(
    ctx: RunQueryCtx,
    args: { keyId?: string; namespace?: string; period?: string; since?: number }
  ) {
    return await ctx.runQuery(this.component.lib.getVerificationsOverTime, args);
  }

  async getOverallStats(ctx: RunQueryCtx, args: { namespace: string }) {
    return await ctx.runQuery(this.component.lib.getOverallStats, args);
  }

  async getAuditLog(
    ctx: RunQueryCtx,
    args?: { keyId?: string; actorId?: string; actionType?: string; limit?: number; since?: number }
  ) {
    return await ctx.runQuery(this.component.lib.getAuditLog, args || {});
  }

  async getVerificationLog(
    ctx: RunQueryCtx,
    args: { keyId: string; limit?: number; since?: number }
  ) {
    return await ctx.runQuery(this.component.lib.getVerificationLog, args);
  }

  async createPermission(
    ctx: RunMutationCtx,
    args: { name: string; description?: string }
  ) {
    return await ctx.runMutation(this.component.lib.createPermission, args);
  }

  async listPermissions(ctx: RunQueryCtx) {
    return await ctx.runQuery(this.component.lib.listPermissions, {});
  }

  async deletePermission(ctx: RunMutationCtx, args: { permissionId: string }) {
    return await ctx.runMutation(this.component.lib.deletePermission, args);
  }

  async createRole(
    ctx: RunMutationCtx,
    args: { name: string; description?: string; permissions: string[] }
  ) {
    return await ctx.runMutation(this.component.lib.createRole, args);
  }

  async listRoles(ctx: RunQueryCtx) {
    return await ctx.runQuery(this.component.lib.listRoles, {});
  }

  async deleteRole(ctx: RunMutationCtx, args: { roleId: string }) {
    return await ctx.runMutation(this.component.lib.deleteRole, args);
  }

  async assignRoles(
    ctx: RunMutationCtx,
    args: { keyId: string; roles: string[] }
  ) {
    return await ctx.runMutation(this.component.lib.assignRoles, args);
  }

  async assignPermissions(
    ctx: RunMutationCtx,
    args: { keyId: string; permissions: string[] }
  ) {
    return await ctx.runMutation(this.component.lib.assignPermissions, args);
  }

  async checkRateLimit(
    ctx: RunMutationCtx,
    args: { identifier: string; namespace: string; limit: number; duration: number }
  ) {
    return await ctx.runMutation(this.component.lib.checkRateLimit, args);
  }

  async setRateLimitOverride(
    ctx: RunMutationCtx,
    args: { keyId: string; limit: number; duration: number }
  ) {
    return await ctx.runMutation(this.component.lib.setRateLimitOverride, args);
  }

  async deleteRateLimitOverride(
    ctx: RunMutationCtx,
    args: { keyId: string }
  ) {
    return await ctx.runMutation(this.component.lib.deleteRateLimitOverride, args);
  }

  async setOwnerRateLimit(
    ctx: RunMutationCtx,
    args: { ownerId: string; namespace: string; limit: number; duration: number }
  ) {
    return await ctx.runMutation(this.component.lib.setOwnerRateLimit, args);
  }

  async deleteOwnerRateLimit(
    ctx: RunMutationCtx,
    args: { ownerId: string; namespace: string }
  ) {
    return await ctx.runMutation(this.component.lib.deleteOwnerRateLimit, args);
  }

  async getRateLimitOverrides(
    ctx: RunQueryCtx,
    args: { namespace: string }
  ) {
    return await ctx.runQuery(this.component.lib.getRateLimitOverrides, args);
  }

  async purgeExpiredKeys(
    ctx: RunMutationCtx,
    args: { namespace: string; olderThan?: number }
  ) {
    return await ctx.runMutation(this.component.lib.purgeExpiredKeys, args);
  }

  async purgeVerificationLogs(
    ctx: RunMutationCtx,
    args?: { olderThan?: number }
  ) {
    const retentionMs = (this.config.logRetentionDays || 90) * 24 * 60 * 60 * 1000;
    return await ctx.runMutation(this.component.lib.purgeVerificationLogs, {
      olderThan: args?.olderThan || (Date.now() - retentionMs),
    });
  }

  static hasPermission(result: VerificationResult, permission: string): boolean {
    return result.permissions?.includes(permission) || false;
  }

  static hasAnyPermission(result: VerificationResult, permissions: string[]): boolean {
    return permissions.some((p) => result.permissions?.includes(p));
  }

  static hasAllPermissions(result: VerificationResult, permissions: string[]): boolean {
    return permissions.every((p) => result.permissions?.includes(p));
  }

  static hasRole(result: VerificationResult, role: string): boolean {
    return result.roles?.includes(role) || false;
  }
}

// Re-export helpers and types
export {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  isRateLimited,
  isExpired,
  isRevoked,
  formatKeyHint,
  calculateExpiration,
  isKeyExpiringSoon,
} from "./helpers.js";

export type {
  VerificationResult,
  CreateKeyResult,
  UsageStats,
  OverallStats,
  AuditEntry,
  VerificationEntry,
  KeyInfo,
  ApiKeysConfig,
  OutcomeCode,
  RunMutationCtx,
  RunQueryCtx,
} from "./types.js";
