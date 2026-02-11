import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function VerificationLog() {
  const keys = useQuery(api.example.listMyKeys);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [codeFilter, setCodeFilter] = useState<string>("ALL");

  const logs = useQuery(
    api.example.getVerificationLog,
    selectedKeyId ? { keyId: selectedKeyId, limit: 200 } : "skip"
  );

  const auditLogs = useQuery(api.example.getAuditLog, { limit: 50 });

  const filteredLogs = logs
    ? codeFilter === "ALL"
      ? logs
      : logs.filter(l => l.code === codeFilter)
    : [];

  const codes = ["ALL", "VALID", "NOT_FOUND", "REVOKED", "EXPIRED", "RATE_LIMITED", "USAGE_EXCEEDED", "DISABLED"];

  return (
    <div className="page">
      <h2>Live Verification Log</h2>

      <div className="log-controls">
        <div className="key-select-row">
          {keys && keys.map(k => (
            <button
              key={k.keyId}
              className={`key-chip ${selectedKeyId === k.keyId ? "key-chip-active" : ""}`}
              onClick={() => setSelectedKeyId(k.keyId)}
            >
              {k.name} <code>{k.hint}</code>
            </button>
          ))}
        </div>

        {selectedKeyId && (
          <div className="filter-row">
            {codes.map(c => (
              <button
                key={c}
                className={`filter-chip ${codeFilter === c ? "filter-chip-active" : ""}`}
                onClick={() => setCodeFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedKeyId && filteredLogs.length > 0 ? (
        <div className="log-feed">
          {filteredLogs.map((log, i) => (
            <div key={i} className={`log-entry ${log.success ? "log-ok" : "log-fail"}`}>
              <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className={`log-code code-${log.code.toLowerCase()}`}>{log.code}</span>
              {log.remaining !== undefined && <span className="log-meta">remaining: {log.remaining}</span>}
              {log.rateLimitRemaining !== undefined && <span className="log-meta">rl: {log.rateLimitRemaining}</span>}
              {log.ip && <span className="log-meta">ip: {log.ip}</span>}
            </div>
          ))}
        </div>
      ) : selectedKeyId ? (
        <p className="empty-msg">No verification logs for this key. Try verifying it first.</p>
      ) : (
        <p className="empty-msg">Select a key above to view its verification log.</p>
      )}

      <h3>Audit Trail</h3>
      {auditLogs && auditLogs.length > 0 ? (
        <div className="log-feed">
          {auditLogs.map((log, i) => (
            <div key={i} className="log-entry log-audit">
              <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className="log-action">{log.action}</span>
              {log.actorId && <span className="log-meta">by: {log.actorId}</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-msg">No audit log entries yet.</p>
      )}
    </div>
  );
}
