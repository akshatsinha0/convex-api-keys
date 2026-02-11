"use client";

import { useQuery, useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";

/*
(1.) React hooks for API key management providing reactive data access.
(2.) Generic hooks that work with any component instance without generated types.
(3.) Enables real-time updates for key lists, stats, and audit logs in React apps.

This module provides React hooks that wrap the component's query and mutation
functions. The hooks leverage Convex's reactive query system to automatically
update components when data changes. All hooks accept a component reference
and return properly typed results.
*/

export function useApiKeys(
  listKeysQuery: FunctionReference<"query">,
  args?: { namespace?: string; ownerId?: string; limit?: number }
) {
  return useQuery(listKeysQuery, args || {});
}

export function useApiKey(
  getKeyQuery: FunctionReference<"query">,
  keyId: string | undefined
) {
  return useQuery(getKeyQuery, keyId ? { keyId } : "skip");
}

export function useKeysByOwner(
  getKeysByOwnerQuery: FunctionReference<"query">,
  ownerId: string | undefined
) {
  return useQuery(getKeysByOwnerQuery, ownerId ? { ownerId } : "skip");
}

export function useUsageStats(
  getUsageStatsQuery: FunctionReference<"query">,
  keyId: string | undefined,
  period?: string
) {
  return useQuery(getUsageStatsQuery, keyId ? { keyId, period } : "skip");
}

export function useOverallStats(
  getOverallStatsQuery: FunctionReference<"query">,
  namespace: string
) {
  return useQuery(getOverallStatsQuery, { namespace });
}

export function useAuditLog(
  getAuditLogQuery: FunctionReference<"query">,
  args?: { keyId?: string; actorId?: string; limit?: number }
) {
  return useQuery(getAuditLogQuery, args || {});
}

export function useVerificationLog(
  getVerificationLogQuery: FunctionReference<"query">,
  keyId: string | undefined,
  args?: { limit?: number; since?: number }
) {
  return useQuery(
    getVerificationLogQuery,
    keyId ? { keyId, ...args } : "skip"
  );
}

export function usePermissions(listPermissionsQuery: FunctionReference<"query">) {
  return useQuery(listPermissionsQuery, {});
}

export function useRoles(listRolesQuery: FunctionReference<"query">) {
  return useQuery(listRolesQuery, {});
}

export function useRateLimitOverrides(
  getRateLimitOverridesQuery: FunctionReference<"query">,
  namespace: string
) {
  return useQuery(getRateLimitOverridesQuery, { namespace });
}

export function useCreateKey(createMutation: FunctionReference<"mutation">) {
  return useMutation(createMutation);
}

export function useVerifyKey(verifyMutation: FunctionReference<"mutation">) {
  return useMutation(verifyMutation);
}

export function useRevokeKey(revokeMutation: FunctionReference<"mutation">) {
  return useMutation(revokeMutation);
}

export function useUpdateKey(updateMutation: FunctionReference<"mutation">) {
  return useMutation(updateMutation);
}

export function useRotateKey(rotateMutation: FunctionReference<"mutation">) {
  return useMutation(rotateMutation);
}

export function useCreatePermission(
  createPermissionMutation: FunctionReference<"mutation">
) {
  return useMutation(createPermissionMutation);
}

export function useCreateRole(createRoleMutation: FunctionReference<"mutation">) {
  return useMutation(createRoleMutation);
}

export function useAssignRoles(assignRolesMutation: FunctionReference<"mutation">) {
  return useMutation(assignRolesMutation);
}

export function useAssignPermissions(
  assignPermissionsMutation: FunctionReference<"mutation">
) {
  return useMutation(assignPermissionsMutation);
}
