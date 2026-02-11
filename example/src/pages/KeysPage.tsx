import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function KeysPage() {
  const keys = useQuery(api.example.listMyKeys);
  const createKey = useMutation(api.example.createApiKey);
  const revokeKey = useMutation(api.example.revokeApiKey);
  const updateKey = useMutation(api.example.updateApiKey);
  const rotateKey = useMutation(api.example.rotateApiKey);

  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState("API Key");
  const [expires, setExpires] = useState("");
  const [remaining, setRemaining] = useState("");
  const [rlLimit, setRlLimit] = useState("100");
  const [rlDuration, setRlDuration] = useState("60000");
  const [environment, setEnvironment] = useState("");

  const handleCreate = async () => {
    const args: any = { name: name.trim() || "API Key" };
    if (expires) args.expires = new Date(expires).getTime();
    if (remaining) args.remaining = parseInt(remaining, 10);
    if (rlLimit && rlDuration) {
      args.ratelimit = { limit: parseInt(rlLimit, 10), duration: parseInt(rlDuration, 10) };
    }
    if (environment) args.environment = environment;

    const result = await createKey(args);
    setCreatedKey(result.key);
    setShowCreate(false);
    setName("API Key");
    setExpires("");
    setRemaining("");
    setRlLimit("100");
    setRlDuration("60000");
    setEnvironment("");
  };

  const handleToggle = async (keyId: string, currentEnabled: boolean) => {
    await updateKey({ keyId, enabled: !currentEnabled });
  };

  const handleRevoke = async (keyId: string) => {
    await revokeKey({ keyId, soft: true });
  };

  const handleRotate = async (keyId: string) => {
    const result = await rotateKey({ keyId, gracePeriodMs: 300000 });
    setCreatedKey(result.key);
  };

  const getStatus = (k: any) => {
    if (k.revokedAt) return { label: "Revoked", cls: "st-revoked" };
    if (!k.enabled) return { label: "Disabled", cls: "st-disabled" };
    if (k.expires && k.expires < Date.now()) return { label: "Expired", cls: "st-expired" };
    return { label: "Active", cls: "st-active" };
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>API Keys</h2>
        <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New Key"}
        </button>
      </div>

      {createdKey && (
        <div className="key-alert">
          <strong>Save this key now — it won't be shown again.</strong>
          <code className="key-display">{createdKey}</code>
          <button className="btn-sm" onClick={() => { navigator.clipboard.writeText(createdKey); }}>
            Copy
          </button>
          <button className="btn-sm" onClick={() => setCreatedKey(null)}>Dismiss</button>
        </div>
      )}

      {showCreate && (
        <div className="create-form">
          <div className="form-grid">
            <label>
              Name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="My API Key" />
            </label>
            <label>
              Expires
              <input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} />
            </label>
            <label>
              Usage Credits
              <input type="number" value={remaining} onChange={e => setRemaining(e.target.value)} placeholder="Unlimited" />
            </label>
            <label>
              Environment
              <input value={environment} onChange={e => setEnvironment(e.target.value)} placeholder="production" />
            </label>
            <label>
              Rate Limit (requests)
              <input type="number" value={rlLimit} onChange={e => setRlLimit(e.target.value)} />
            </label>
            <label>
              Rate Window (ms)
              <input type="number" value={rlDuration} onChange={e => setRlDuration(e.target.value)} />
            </label>
          </div>
          <button className="btn-primary" onClick={handleCreate}>Create Key</button>
        </div>
      )}

      {keys === undefined ? (
        <p className="loading">Loading...</p>
      ) : keys.length === 0 ? (
        <p className="empty-msg">No keys yet. Create one above.</p>
      ) : (
        <div className="keys-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Hint</th>
                <th>Status</th>
                <th>Credits</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => {
                const st = getStatus(k);
                return (
                  <tr key={k.keyId}>
                    <td><strong>{k.name}</strong></td>
                    <td><code>{k.hint}</code></td>
                    <td><span className={`status-badge ${st.cls}`}>{st.label}</span></td>
                    <td>{k.remaining !== undefined ? k.remaining : "∞"}</td>
                    <td>{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="action-cell">
                      {!k.revokedAt && (
                        <>
                          <button className="btn-sm" onClick={() => handleToggle(k.keyId, k.enabled)}>
                            {k.enabled ? "Disable" : "Enable"}
                          </button>
                          <button className="btn-sm" onClick={() => handleRotate(k.keyId)}>
                            Rotate
                          </button>
                          <button className="btn-sm btn-danger" onClick={() => handleRevoke(k.keyId)}>
                            Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
