import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

export function UsageDashboard() {
  const overview = useQuery(api.example.getOverviewStats);
  const usage = useQuery(api.example.getMyUsageStats);
  const keys = useQuery(api.example.listMyKeys);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const keyUsage = useQuery(
    api.example.getKeyUsageStats,
    selectedKeyId ? { keyId: selectedKeyId } : "skip"
  );

  if (!overview || !usage) return <p className="loading">Loading...</p>;

  const usageBreakdown = [
    { label: "Valid", value: usage.valid, cls: "bar-valid" },
    { label: "Rate Limited", value: usage.rateLimited, cls: "bar-ratelimited" },
    { label: "Usage Exceeded", value: usage.usageExceeded, cls: "bar-exceeded" },
    { label: "Expired", value: usage.expired, cls: "bar-expired" },
    { label: "Revoked", value: usage.revoked, cls: "bar-revoked" },
    { label: "Disabled", value: usage.disabled, cls: "bar-disabled" },
    { label: "Not Found", value: usage.notFound, cls: "bar-notfound" },
  ];

  const maxVal = Math.max(...usageBreakdown.map(b => b.value), 1);

  return (
    <div className="page">
      <h2>Usage Dashboard</h2>

      <div className="stats-row">
        <div className="stat-box">
          <div className="stat-num">{overview.totalKeys}</div>
          <div className="stat-label">Total Keys</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">{overview.activeKeys}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">{overview.revokedKeys}</div>
          <div className="stat-label">Revoked</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">{overview.totalVerifications}</div>
          <div className="stat-label">Verifications</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">{(overview.successRate * 100).toFixed(1)}%</div>
          <div className="stat-label">Success Rate</div>
        </div>
      </div>

      <h3>Verification Breakdown</h3>
      <div className="bar-chart">
        {usageBreakdown.map(b => (
          <div key={b.label} className="bar-row">
            <span className="bar-label">{b.label}</span>
            <div className="bar-track">
              <div
                className={`bar-fill ${b.cls}`}
                style={{ width: `${(b.value / maxVal) * 100}%` }}
              />
            </div>
            <span className="bar-value">{b.value}</span>
          </div>
        ))}
      </div>

      <h3>Per-Key Usage</h3>
      {keys && keys.length > 0 ? (
        <>
          <div className="key-select-row">
            {keys.map(k => (
              <button
                key={k.keyId}
                className={`key-chip ${selectedKeyId === k.keyId ? "key-chip-active" : ""}`}
                onClick={() => setSelectedKeyId(k.keyId)}
              >
                {k.name} <code>{k.hint}</code>
              </button>
            ))}
          </div>
          {keyUsage && (
            <div className="key-usage-detail">
              <div className="mini-stats">
                <span>Total: {keyUsage.total}</span>
                <span>Valid: {keyUsage.valid}</span>
                <span>Rate Limited: {keyUsage.rateLimited}</span>
                <span>Exceeded: {keyUsage.usageExceeded}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="empty-msg">No keys yet. Create one from the Keys page.</p>
      )}
    </div>
  );
}
