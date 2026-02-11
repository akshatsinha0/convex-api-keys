import type { MutationCtx } from "../../_generated/server.js";
import type { Doc } from "../../_generated/dataModel.js";
import type { OutcomeCode } from "../../types/keys.js";

/*
(1.) Extracted validation checks and helpers for the verify mutation handler.
(2.) Separates key validity checking, credit refill, and permission resolution logic.

This module breaks down the monolithic verify handler into testable, focused functions.
checkKeyValidity runs the sequential early-return checks (revoked, disabled, expired,
rotation grace). applyRefillIfNeeded handles usage credit replenishment on interval
boundaries. resolvePermissions aggregates direct and role-inherited permissions.
*/

export type CheckResult =
  | { valid: true }
  | { valid: false; code: OutcomeCode; message: string };

export function checkKeyValidity(
  keyRecord: Doc<"keys">,
  now: number
): CheckResult {
  if (keyRecord.revokedAt) {
    return { valid: false, code: "REVOKED", message: "API key has been revoked" };
  }
  if (!keyRecord.enabled) {
    return { valid: false, code: "DISABLED", message: "API key is disabled" };
  }
  if (keyRecord.expires && keyRecord.expires < now) {
    return { valid: false, code: "EXPIRED", message: "API key has expired" };
  }
  if (keyRecord.rotationGraceEnd && keyRecord.rotationGraceEnd < now) {
    return {
      valid: false,
      code: "ROTATION_GRACE_EXPIRED",
      message: "API key rotation grace period has expired",
    };
  }
  return { valid: true };
}

const REFILL_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export async function applyRefillIfNeeded(
  ctx: MutationCtx,
  keyRecord: Doc<"keys">,
  now: number
): Promise<void> {
  if (!keyRecord.refill || keyRecord.remaining === undefined) return;

  const intervalMs = REFILL_INTERVALS[keyRecord.refill.interval];
  if (!intervalMs) return;

  const elapsed = now - keyRecord.refill.lastRefill;
  if (elapsed >= intervalMs) {
    await ctx.db.patch(keyRecord._id, {
      remaining: keyRecord.refill.amount,
      refill: { ...keyRecord.refill, lastRefill: now },
      updatedAt: now,
    });
    (keyRecord as Record<string, unknown>).remaining = keyRecord.refill.amount;
    keyRecord.refill.lastRefill = now;
  }
}

export async function resolvePermissions(
  ctx: MutationCtx,
  permissionIds: string[],
  roleIds: string[]
): Promise<string[]> {
  const permissions = new Set<string>(permissionIds);

  for (const roleId of roleIds) {
    const role = await ctx.db
      .query("roles")
      .filter((q) => q.eq(q.field("_id"), roleId))
      .first();

    if (role) {
      for (const p of role.permissionIds) {
        permissions.add(p);
      }
    }
  }

  return Array.from(permissions);
}

export async function logVerification(
  ctx: MutationCtx,
  keyHash: string,
  success: boolean,
  code: OutcomeCode,
  args: { tags?: unknown; ip?: string },
  rateLimitRemaining?: number,
  remaining?: number
): Promise<void> {
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
