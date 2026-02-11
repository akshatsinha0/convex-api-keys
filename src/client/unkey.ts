/*
(1.) Client SDK for optional Unkey integration following the Resend pattern.
(2.) UnkeyApiKeys wraps Unkey SDK calls for write operations, then mirrors results into component tables.
(3.) Read operations delegate directly to component queries -- no Unkey call needed.

This module provides an alternative client class that uses Unkey as the key management
engine while maintaining a local mirror in the component for reactive queries, analytics,
and audit trails. Write operations (create, verify, revoke, update) call the Unkey API
first, then persist results via component mutations. Read operations are pure Convex
queries, enabling real-time dashboards and subscriptions. The user must construct the
Unkey client externally (since components cannot access process.env) and pass it in.
*/

import type { GenericActionCtx, GenericDataModel, GenericQueryCtx } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { ApiKeysConfig, OutcomeCode, VerificationResult } from "../component/types.js";

export type RunActionCtx = {
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"];
  runQuery: GenericActionCtx<GenericDataModel>["runQuery"];
};

export type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

export interface UnkeyConfig extends ApiKeysConfig {
  apiId: string;
}

interface UnkeyClient {
  keys: {
    create(args: Record<string, unknown>): Promise<{ result?: { key: string; keyId: string }; error?: { message: string } }>;
    verifyKey(args: Record<string, unknown>): Promise<{ result?: { valid: boolean; code?: string; remaining?: number; ratelimit?: { remaining: number; reset: number } }; error?: { message: string } }>;
    delete(args: Record<string, unknown>): Promise<{ error?: { message: string } }>;
    update(args: Record<string, unknown>): Promise<{ error?: { message: string } }>;
  };
}

async function hashUnkeyId(unkeyKeyId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`unkey:${unkeyKeyId}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildHint(key: string, prefix: string): string {
  const body = key.slice(prefix.length);
  if (body.length < 8) return key;
  return `${prefix}${body.slice(0, 4)}...${body.slice(-4)}`;
}

function mapUnkeyCode(code?: string): OutcomeCode {
  switch (code) {
    case "VALID": return "VALID";
    case "NOT_FOUND": return "NOT_FOUND";
    case "RATE_LIMITED": return "RATE_LIMITED";
    case "USAGE_EXCEEDED": return "USAGE_EXCEEDED";
    case "DISABLED": return "DISABLED";
    case "EXPIRED": return "EXPIRED";
    case "FORBIDDEN": return "DISABLED";
    default: return "NOT_FOUND";
  }
}

export class UnkeyApiKeys {
  public component: ComponentApi;
  private config: UnkeyConfig;
  private unkey: UnkeyClient;

  constructor(
    component: ComponentApi,
    config: UnkeyConfig,
    unkeyClient: UnkeyClient
  ) {
    this.component = component;
    this.config = config;
    this.unkey = unkeyClient;
  }

  async create(
    ctx: RunActionCtx,
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
    }
  ): Promise<{ key: string; keyId: string; unkeyKeyId: string }> {
    const prefix = args.prefix || this.config.defaultPrefix || "sk_";
    const namespace = args.namespace || this.config.defaultNamespace || "default";

    const unkeyArgs: Record<string, unknown> = {
      apiId: this.config.apiId,
      prefix: prefix.replace(/_$/, ""),
      ownerId: args.ownerId,
      name: args.name,
      meta: args.meta,
    };

    if (args.expires) unkeyArgs.expires = args.expires;
    if (args.remaining !== undefined) unkeyArgs.remaining = args.remaining;

    if (args.refill) {
      unkeyArgs.refill = {
        amount: args.refill.amount,
        interval: args.refill.interval === "hourly" ? "daily" : args.refill.interval,
        refillDay: undefined,
      };
    }

    if (args.ratelimit) {
      unkeyArgs.ratelimit = {
        type: "fast",
        limit: args.ratelimit.limit,
        duration: args.ratelimit.duration,
      };
    }

    const { result, error } = await this.unkey.keys.create(unkeyArgs);
    if (error || !result) {
      throw new Error(`Unkey create failed: ${error?.message || "Unknown error"}`);
    }

    const hash = await hashUnkeyId(result.keyId);
    const hint = buildHint(result.key, prefix);

    const localKeyId: string = await ctx.runMutation(this.component.lib.importKey, {
      unkeyKeyId: result.keyId,
      hash,
      prefix,
      hint,
      namespace,
      ownerId: args.ownerId,
      name: args.name,
      meta: args.meta,
      expires: args.expires,
      remaining: args.remaining,
      refill: args.refill ? { amount: args.refill.amount, interval: args.refill.interval } : undefined,
      ratelimit: args.ratelimit,
      roles: args.roles,
      permissions: args.permissions,
      environment: args.environment,
    });

    return { key: result.key, keyId: localKeyId, unkeyKeyId: result.keyId };
  }

  async verify(
    ctx: RunActionCtx,
    args: {
      key: string;
      tags?: Record<string, unknown>;
      ip?: string;
      namespace?: string;
    }
  ): Promise<VerificationResult> {
    const { result, error } = await this.unkey.keys.verifyKey({
      key: args.key,
      apiId: this.config.apiId,
    });

    if (error || !result) {
      return {
        valid: false,
        code: "NOT_FOUND",
        permissions: [],
        roles: [],
        message: `Unkey verify failed: ${error?.message || "Unknown error"}`,
      };
    }

    const code = mapUnkeyCode(result.code);
    const unkeyKeyId = (result as Record<string, unknown>).keyId as string | undefined;

    if (unkeyKeyId) {
      await ctx.runMutation(this.component.lib.logExternalVerification, {
        unkeyKeyId,
        success: result.valid,
        code,
        remaining: result.remaining,
        rateLimitRemaining: result.ratelimit?.remaining,
        tags: args.tags,
        ip: args.ip,
      });
    }

    return {
      valid: result.valid,
      code,
      remaining: result.remaining,
      ratelimit: result.ratelimit ? { remaining: result.ratelimit.remaining, reset: result.ratelimit.reset } : undefined,
      permissions: [],
      roles: [],
      message: result.valid ? "API key is valid" : `Verification failed: ${code}`,
    };
  }

  async revoke(
    ctx: RunActionCtx,
    args: { keyId: string; soft?: boolean }
  ): Promise<void> {
    const keyInfo = await ctx.runQuery(this.component.lib.getKey, { keyId: args.keyId });
    if (!keyInfo) throw new Error("Key not found");

    if (keyInfo.unkeyKeyId) {
      const { error } = await this.unkey.keys.delete({ keyId: keyInfo.unkeyKeyId });
      if (error) {
        throw new Error(`Unkey delete failed: ${error.message}`);
      }
    }

    await ctx.runMutation(this.component.lib.revoke, { keyId: args.keyId, soft: args.soft });
  }

  async update(
    ctx: RunActionCtx,
    args: {
      keyId: string;
      name?: string;
      meta?: Record<string, unknown>;
      expires?: number | null;
      remaining?: number;
      ratelimit?: { limit: number; duration: number };
      enabled?: boolean;
    }
  ): Promise<void> {
    const keyInfo = await ctx.runQuery(this.component.lib.getKey, { keyId: args.keyId });
    if (!keyInfo) throw new Error("Key not found");

    if (keyInfo.unkeyKeyId) {
      const unkeyUpdates: Record<string, unknown> = {};
      if (args.name !== undefined) unkeyUpdates.name = args.name;
      if (args.meta !== undefined) unkeyUpdates.meta = args.meta;
      if (args.expires !== undefined) unkeyUpdates.expires = args.expires;
      if (args.remaining !== undefined) unkeyUpdates.remaining = args.remaining;
      if (args.enabled !== undefined) unkeyUpdates.enabled = args.enabled;
      if (args.ratelimit !== undefined) {
        unkeyUpdates.ratelimit = {
          type: "fast",
          limit: args.ratelimit.limit,
          duration: args.ratelimit.duration,
        };
      }

      const { error } = await this.unkey.keys.update({
        keyId: keyInfo.unkeyKeyId,
        ...unkeyUpdates,
      });
      if (error) {
        throw new Error(`Unkey update failed: ${error.message}`);
      }
    }

    await ctx.runMutation(this.component.lib.update, args);
  }

  async listKeys(
    ctx: RunQueryCtx,
    args?: { namespace?: string; ownerId?: string; limit?: number }
  ) {
    return await ctx.runQuery(this.component.lib.listKeys, {
      namespace: args?.namespace || this.config.defaultNamespace,
      ownerId: args?.ownerId,
      limit: args?.limit,
    });
  }

  async getKey(ctx: RunQueryCtx, args: { keyId: string }) {
    return await ctx.runQuery(this.component.lib.getKey, args);
  }

  async getKeysByOwner(ctx: RunQueryCtx, args: { ownerId: string }) {
    return await ctx.runQuery(this.component.lib.getKeysByOwner, args);
  }

  async getUsageStats(ctx: RunQueryCtx, args: { keyId: string; period?: string }) {
    return await ctx.runQuery(this.component.lib.getUsageStats, args);
  }

  async getUsageByOwner(ctx: RunQueryCtx, args: { ownerId: string; period?: string }) {
    return await ctx.runQuery(this.component.lib.getUsageByOwner, args);
  }

  async getOverallStats(ctx: RunQueryCtx, args: { namespace: string }) {
    return await ctx.runQuery(this.component.lib.getOverallStats, args);
  }

  async getAuditLog(
    ctx: RunQueryCtx,
    args?: { keyId?: string; actorId?: string; limit?: number }
  ) {
    return await ctx.runQuery(this.component.lib.getAuditLog, args || {});
  }

  async getVerificationLog(
    ctx: RunQueryCtx,
    args: { keyId: string; limit?: number; since?: number }
  ) {
    return await ctx.runQuery(this.component.lib.getVerificationLog, args);
  }
}
