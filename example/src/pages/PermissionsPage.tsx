import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function PermissionsPage() {
  const permissions = useQuery(api.example.listPermissions);
  const roles = useQuery(api.example.listRoles);
  const keys = useQuery(api.example.listMyKeys);

  const createPerm = useMutation(api.example.createPermission);
  const deletePerm = useMutation(api.example.deletePermission);
  const createRole = useMutation(api.example.createRole);
  const deleteRole = useMutation(api.example.deleteRole);
  const assignPerms = useMutation(api.example.assignPermissionsToKey);
  const assignRoles = useMutation(api.example.assignRolesToKey);

  const [permName, setPermName] = useState("");
  const [permDesc, setPermDesc] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);

  const handleCreatePerm = async () => {
    if (!permName.trim()) return;
    await createPerm({ name: permName, description: permDesc || undefined });
    setPermName("");
    setPermDesc("");
  };

  const handleCreateRole = async () => {
    if (!roleName.trim()) return;
    await createRole({ name: roleName, description: roleDesc || undefined, permissions: rolePerms });
    setRoleName("");
    setRoleDesc("");
    setRolePerms([]);
  };

  const toggleRolePerm = (permId: string) => {
    setRolePerms(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  return (
    <div className="page">
      <h2>Permissions Manager</h2>

      <div className="two-col">
        <div>
          <h3>Permissions</h3>
          <div className="form-row">
            <input placeholder="Permission name (e.g. users.read)" value={permName} onChange={e => setPermName(e.target.value)} />
            <input placeholder="Description" value={permDesc} onChange={e => setPermDesc(e.target.value)} />
            <button onClick={handleCreatePerm}>Add</button>
          </div>
          {permissions && permissions.length > 0 ? (
            <div className="item-list">
              {permissions.map(p => (
                <div key={p.id} className="item-row">
                  <span className="item-name">{p.name}</span>
                  <span className="item-desc">{p.description || ""}</span>
                  <button className="btn-sm btn-danger" onClick={() => deletePerm({ permissionId: p.id })}>x</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-msg">No permissions defined.</p>
          )}
        </div>

        <div>
          <h3>Roles</h3>
          <div className="form-row">
            <input placeholder="Role name (e.g. admin)" value={roleName} onChange={e => setRoleName(e.target.value)} />
            <input placeholder="Description" value={roleDesc} onChange={e => setRoleDesc(e.target.value)} />
            <button onClick={handleCreateRole}>Add</button>
          </div>
          {permissions && permissions.length > 0 && (
            <div className="perm-checkboxes">
              {permissions.map(p => (
                <label key={p.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={rolePerms.includes(p.id)}
                    onChange={() => toggleRolePerm(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
          {roles && roles.length > 0 ? (
            <div className="item-list">
              {roles.map(r => (
                <div key={r.id} className="item-row">
                  <span className="item-name">{r.name}</span>
                  <span className="item-desc">{r.permissionIds.length} perms</span>
                  <button className="btn-sm btn-danger" onClick={() => deleteRole({ roleId: r.id })}>x</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-msg">No roles defined.</p>
          )}
        </div>
      </div>

      <h3>Key Assignments</h3>
      {keys && keys.length > 0 && permissions && roles ? (
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Permissions</th>
              <th>Roles</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <KeyAssignRow
                key={k.keyId}
                keyInfo={k}
                allPermissions={permissions}
                allRoles={roles}
                assignPerms={assignPerms}
                assignRoles={assignRoles}
              />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-msg">Create keys and permissions first.</p>
      )}
    </div>
  );
}

function KeyAssignRow({ keyInfo, allPermissions, allRoles, assignPerms, assignRoles }: {
  keyInfo: any;
  allPermissions: any[];
  allRoles: any[];
  assignPerms: any;
  assignRoles: any;
}) {
  const [selPerms, setSelPerms] = useState<string[]>(keyInfo.permissions || []);
  const [selRoles, setSelRoles] = useState<string[]>(keyInfo.roles || []);

  const handleSavePerms = async () => {
    await assignPerms({ keyId: keyInfo.keyId, permissions: selPerms });
  };

  const handleSaveRoles = async () => {
    await assignRoles({ keyId: keyInfo.keyId, roles: selRoles });
  };

  return (
    <tr>
      <td>
        <strong>{keyInfo.name}</strong>
        <br />
        <code>{keyInfo.hint}</code>
      </td>
      <td>
        <div className="perm-checkboxes-sm">
          {allPermissions.map(p => (
            <label key={p.id} className="checkbox-label-sm">
              <input
                type="checkbox"
                checked={selPerms.includes(p.id)}
                onChange={() =>
                  setSelPerms(prev =>
                    prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                  )
                }
              />
              {p.name}
            </label>
          ))}
          <button className="btn-sm" onClick={handleSavePerms}>Save</button>
        </div>
      </td>
      <td>
        <div className="perm-checkboxes-sm">
          {allRoles.map(r => (
            <label key={r.id} className="checkbox-label-sm">
              <input
                type="checkbox"
                checked={selRoles.includes(r.id)}
                onChange={() =>
                  setSelRoles(prev =>
                    prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id]
                  )
                }
              />
              {r.name}
            </label>
          ))}
          <button className="btn-sm" onClick={handleSaveRoles}>Save</button>
        </div>
      </td>
      <td>
        {keyInfo.permissions.length} perms, {keyInfo.roles.length} roles
      </td>
    </tr>
  );
}
