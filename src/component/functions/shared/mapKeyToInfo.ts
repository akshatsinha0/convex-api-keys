import type { Doc } from "../../_generated/dataModel.js";
import type { KeyInfo } from "../../types/keys.js";

/*
(1.) Shared utility to map a key document to the public KeyInfo shape.
(2.) Eliminates the 15-field mapping duplicated across listKeys, getKey, and getKeysByOwner.

This function converts an internal key document into the public-facing KeyInfo type,
translating internal field names (permissionIds/roleIds) to their external equivalents
(permissions/roles) and serializing the document ID to a string.
*/

export function mapKeyToInfo(k: Doc<"keys">): KeyInfo {
  return {
    keyId: k._id.toString(),
    hint: k.hint,
    namespace: k.namespace,
    ownerId: k.ownerId,
    name: k.name,
    meta: k.meta,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    expires: k.expires,
    remaining: k.remaining,
    enabled: k.enabled,
    revokedAt: k.revokedAt,
    environment: k.environment,
    permissions: k.permissionIds,
    roles: k.roleIds,
    unkeyKeyId: k.unkeyKeyId,
  };
}
