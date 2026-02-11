/*
(1.) Client-side type definitions for the API keys component.
(2.) Re-exports component types for consumer convenience.
(3.) Defines context types needed for client SDK method signatures.

These types provide the public interface for consuming applications. They mirror
the component's internal types but are designed for use at the component boundary
where Convex IDs become strings.
*/

import type { GenericActionCtx, GenericDataModel, GenericMutationCtx, GenericQueryCtx } from "convex/server";

export type RunMutationCtx = GenericMutationCtx<GenericDataModel>;
export type RunQueryCtx = GenericQueryCtx<GenericDataModel>;
export type RunActionCtx = {
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"];
  runQuery: GenericActionCtx<GenericDataModel>["runQuery"];
};

export type {
  VerificationResult,
  CreateKeyArgs,
  CreateKeyResult,
  VerifyKeyArgs,
  RevokeKeyArgs,
  UpdateKeyArgs,
  RotateKeyArgs,
  CheckRateLimitArgs,
  RateLimitResult,
  CreatePermissionArgs,
  CreateRoleArgs,
  AssignRolesArgs,
  AssignPermissionsArgs,
  ListKeysArgs,
  GetKeyArgs,
  GetKeysByOwnerArgs,
  GetUsageStatsArgs,
  GetUsageByOwnerArgs,
  GetOverallStatsArgs,
  GetAuditLogArgs,
  GetVerificationLogArgs,
  GetRateLimitOverridesArgs,
  PurgeExpiredKeysArgs,
  PurgeVerificationLogsArgs,
  SetRateLimitOverrideArgs,
  DeleteRateLimitOverrideArgs,
  UsageStats,
  OverviewStats as OverallStats,
  AuditEntry,
  VerificationEntry,
  KeyInfo,
  ApiKeysConfig,
  OutcomeCode,
} from "../component/types.js";
