/*
(1.) Type definitions for RBAC operations: permissions, roles, and assignments.

These types define the contract for role-based access control at component boundaries.
*/

export interface CreatePermissionArgs {
  name: string;
  description?: string;
}

export interface CreateRoleArgs {
  name: string;
  description?: string;
  permissions: string[];
}

export interface AssignRolesArgs {
  keyId: string;
  roles: string[];
}

export interface AssignPermissionsArgs {
  keyId: string;
  permissions: string[];
}
