import type { MutationCtx } from "../../_generated/server.js";

/*
(1.) Shared utility for inserting audit log entries with consistent field structure.
(2.) Eliminates the repeated ctx.db.insert("auditLog", ...) pattern across 10+ call sites.

This function provides a single entry point for audit logging, ensuring consistent
timestamp generation and field naming across all mutation operations.
*/

export async function logAudit(
  ctx: MutationCtx,
  action: string,
  details?: Record<string, unknown>,
  targetKeyHash?: string,
  actorId?: string
): Promise<void> {
  await ctx.db.insert("auditLog", {
    action,
    actorId,
    targetKeyHash,
    timestamp: Date.now(),
    details,
  });
}
