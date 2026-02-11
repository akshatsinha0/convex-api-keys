import type { MutationCtx } from "../../_generated/server.js";
import type { Doc, Id } from "../../_generated/dataModel.js";

/*
(1.) Input validation guards implementing fail-fast pattern at mutation boundaries.
(2.) Provides reusable assertions for common parameter constraints.

These guards throw descriptive errors immediately on invalid input, preventing
deeper failures and providing clear diagnostics. Used at the entry point of
mutations that accept user-provided numeric or string parameters.
*/

export function assertPositive(value: number, name: string): void {
  if (value <= 0) {
    throw new Error(`${name} must be positive, got ${value}`);
  }
}

export function assertNonEmpty(value: string, name: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

export function assertValidExpiry(expires: number, name: string): void {
  if (expires <= Date.now()) {
    throw new Error(`${name} must be in the future`);
  }
}

export async function assertKeyExists(
  ctx: MutationCtx,
  keyId: string
): Promise<Doc<"keys">> {
  const key = await ctx.db.get(keyId as Id<"keys">);
  if (!key) {
    throw new Error("Key not found");
  }
  return key;
}
