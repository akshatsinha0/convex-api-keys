import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import "./App.css";

/*
(1.) Example React app demonstrating API keys component usage.
(2.) Shows key creation, listing, and management in a React UI.
(3.) Uses Convex React hooks for reactive updates.

This example app demonstrates how to build a simple API key management
dashboard using the component's functions. It shows real-time updates
as keys are created, updated, or revoked.
*/

function App() {
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  
  const keys = useQuery(api.example.listMyKeys);
  const createKey = useMutation(api.example.createApiKey);
  const revokeKey = useMutation(api.example.revokeApiKey);
  
  const handleCreateKey = async () => {
    if (!keyName.trim()) return;
    
    const result = await createKey({
      name: keyName,
      ratelimit: {
        limit: 100,
        duration: 60000, // 100 requests per minute
      },
    });
    
    setCreatedKey(result.key);
    setKeyName("");
  };
  
  const handleRevokeKey = async (keyId: string) => {
    if (confirm("Are you sure you want to revoke this key?")) {
      await revokeKey({ keyId, soft: true });
    }
  };
  
  return (
    <div className="app">
      <h1>API Key Management</h1>
      
      {createdKey && (
        <div className="alert">
          <h3>⚠️ Save this key - it won't be shown again!</h3>
          <code>{createdKey}</code>
          <button onClick={() => setCreatedKey(null)}>Dismiss</button>
        </div>
      )}
      
      <div className="create-key">
        <h2>Create New Key</h2>
        <input
          type="text"
          placeholder="Key name"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
        />
        <button onClick={handleCreateKey}>Create Key</button>
      </div>
      
      <div className="keys-list">
        <h2>Your API Keys</h2>
        {keys === undefined ? (
          <p>Loading...</p>
        ) : keys.length === 0 ? (
          <p>No keys yet. Create one above!</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Hint</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.keyId}>
                  <td>{key.name}</td>
                  <td><code>{key.hint}</code></td>
                  <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                  <td>
                    {key.revokedAt ? (
                      <span className="status revoked">Revoked</span>
                    ) : !key.enabled ? (
                      <span className="status disabled">Disabled</span>
                    ) : key.expires && key.expires < Date.now() ? (
                      <span className="status expired">Expired</span>
                    ) : (
                      <span className="status active">Active</span>
                    )}
                  </td>
                  <td>
                    {!key.revokedAt && (
                      <button
                        onClick={() => handleRevokeKey(key.keyId)}
                        className="revoke-btn"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default App;
