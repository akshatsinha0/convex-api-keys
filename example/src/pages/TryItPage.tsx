import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function TryItPage() {
  const [key, setKey] = useState("");
  const [result, setResult] = useState<any>(null);
  const [timing, setTiming] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const verify = useMutation(api.example.verifyApiKey);

  const handleVerify = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setResult(null);
    setTiming(null);

    const start = performance.now();
    try {
      const res = await verify({ key: key.trim() });
      const elapsed = performance.now() - start;
      setResult(res);
      setTiming(elapsed);
    } catch (err: any) {
      setResult({ error: err.message || "Verification failed" });
      setTiming(performance.now() - start);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h2>Try It</h2>
      <p className="page-desc">Paste an API key and verify it against the component. See the full result and timing.</p>

      <div className="tryit-form">
        <input
          type="text"
          className="tryit-input"
          placeholder="sk_a7Bx9Kp2mQ..."
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleVerify()}
        />
        <button className="btn-primary" onClick={handleVerify} disabled={loading}>
          {loading ? "Verifying..." : "Verify"}
        </button>
      </div>

      {timing !== null && (
        <div className="timing-badge">
          Round-trip: {timing.toFixed(1)}ms
        </div>
      )}

      {result && (
        <div className="result-box">
          {result.error ? (
            <div className="result-error">{result.error}</div>
          ) : (
            <>
              <div className={`result-status ${result.valid ? "result-valid" : "result-invalid"}`}>
                {result.valid ? "VALID" : result.code}
              </div>
              <div className="result-grid">
                {result.keyId && <div className="result-field"><span>Key ID</span><span>{result.keyId}</span></div>}
                {result.ownerId && <div className="result-field"><span>Owner</span><span>{result.ownerId}</span></div>}
                {result.code && <div className="result-field"><span>Code</span><span>{result.code}</span></div>}
                {result.remaining !== undefined && <div className="result-field"><span>Remaining</span><span>{result.remaining}</span></div>}
                {result.ratelimit && (
                  <div className="result-field">
                    <span>Rate Limit</span>
                    <span>{result.ratelimit.remaining} left, resets {new Date(result.ratelimit.reset).toLocaleTimeString()}</span>
                  </div>
                )}
                {result.permissions && result.permissions.length > 0 && (
                  <div className="result-field"><span>Permissions</span><span>{result.permissions.join(", ")}</span></div>
                )}
                {result.roles && result.roles.length > 0 && (
                  <div className="result-field"><span>Roles</span><span>{result.roles.join(", ")}</span></div>
                )}
                {result.message && <div className="result-field"><span>Message</span><span>{result.message}</span></div>}
                {result.meta && <div className="result-field"><span>Meta</span><span>{JSON.stringify(result.meta)}</span></div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
