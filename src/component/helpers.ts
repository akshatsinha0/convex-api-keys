import type { Doc } from "./_generated/dataModel.js";

export function isKeyDoc(doc: any): doc is Doc<"keys"> {
  return doc && doc._tableName === "keys";
}

export function isPermissionDoc(doc: any): doc is Doc<"permissions"> {
  return doc && doc._tableName === "permissions";
}

export function isRoleDoc(doc: any): doc is Doc<"roles"> {
  return doc && doc._tableName === "roles";
}
