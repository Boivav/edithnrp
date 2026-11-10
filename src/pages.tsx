/**
 * ==============================================================================
 * E.D.I.T.H. - APPLICATION PAGES & INTERFACE VIEWS
 * ==============================================================================
 * Contains:
 * - Dashboard: System overview, aggregate trust score, active alerts, quick app cards
 * - Applications: Application catalog with permission chips and risk indicators
 * - Detail: Interactive profile, permission governance, and live ML feature sliders
 * - Alerts: Security notifications, anomaly advisories, and one-click remediation
 * - Activity: Auditing event log stream with multi-criteria filtering
 * ==============================================================================
 */

import { useState } from "react";
import { Sim, AppState, W, PN, Status, getApp, recs, allRecs } from "./engine";
import { FEATURE_NAMES, FEATURE_METADATA } from "./ml/features";
import { Ring, Chart, Chips, RecItem, AlertItem, LogRow, Act, tc, lvl } from "./ui";

type P = { S: Sim; act: Act };
const Empty = ({ children }: { children: string }) => (
  <p style={{ color: "var(--mut)", margin: 0 }}>{children}</p>
);

export function Dashboard({ S, act }: P) {
  const open = S.alerts.filter(a => a.state === "open");
  const avg = S.apps.reduce((s, a) => s + a.trust, 0) / (S.apps.length || 1);
  const bad = S.apps.filter(a => a.trust < 50).length;
  const rg = S.apps.find(a => a.rogue && a.trust < 50);
  const rs = allRecs(S);

  return (
    <>
      {rg && (
        <div className="banner">
          ⚠️ {rg.name} is behaving abnormally. Review the AI recommendations below.
        </div>
      )}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <b style={{ color: tc(avg) }}>{Math.round(avg)}</b>
          <span>Average trust score</span>
        </div>
        <div className="card stat">
          <b>{open.length}</b>
          <span>Open alerts</span>
        </div>
        <div className="card stat">
          <b style={{ color: bad ? "var(--bad)" : "var(--good)" }}>{bad}</b>
          <span>Apps at high risk</span>
        </div>
        <div className="card stat">
          <b>{S.apps.reduce((s, a) => s + a.f.access_count, 0)}</b>
          <span>Allowed accesses, last {W} ticks</span>
        </div>
      </div>

      <div className="grid g3">
        {S.apps.map(a => (
          <a key={a.id} className="card app" href={`#app-${a.id}`}>
            <Ring t={a.trust} />
            <div className="t">
              <b>{a.icon} {a.name}</b>
              <div style={{ color: tc(a.trust), fontSize: 13, fontWeight: 600 }}>
                {lvl(a.trust)} · {a.trust}%
              </div>
              <small style={{ color: "var(--mut)" }}>
                {Object.keys(a.perms).length} permissions · {a.f.access_count} accesses
                {a.monitoringMode === "manual" ? " · Manual Sliders" : ""}
              </small>
            </div>
          </a>
        ))}
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Trust score trend</h3>
          <Chart ser={S.apps.map(a => ({ c: a.col, n: a.name, d: a.hist }))} />
        </div>
        <div className="card">
          <h3>Recommended actions</h3>
          {rs.length ? (
            rs.map(r => <RecItem key={r.app + r.perm} S={S} r={r} act={act} />)
          ) : (
            <Empty>No actions needed. All applications are operating within normal baseline parameters.</Empty>
          )}
          <h3 style={{ marginTop: 14 }}>Recent alerts</h3>
          {S.alerts.length ? (
            S.alerts.slice(0, 4).map(x => <AlertItem key={x.id} S={S} x={x} act={act} />)
          ) : (
            <Empty>No alerts. All application behaviors are healthy.</Empty>
          )}
        </div>
      </div>
    </>
  );
}

export function Applications({ S }: P) {
  return (
    <>
      <h2>Monitored Applications</h2>
      <div className="grid">
        {S.apps.map(a => (
          <a key={a.id} className="card app" href={`#app-${a.id}`} style={{ alignItems: "flex-start" }}>
            <Ring t={a.trust} s={72} />
            <div className="t">
              <b>{a.icon} {a.name}</b>{" "}
              <span className="badge" style={{ color: tc(a.trust) }}>
                {lvl(a.trust)} ({a.trust}%)
              </span>
              {a.monitoringMode === "manual" && (
                <span className="chip" style={{ borderLeftColor: "var(--warn)", marginLeft: 6 }}>
                  Manual Sliders
                </span>
              )}
              <div style={{ margin: "6px 0" }}>
                <Chips a={a} />
              </div>
              <small style={{ color: "var(--mut)" }}>
                Frequency {a.f.frequency_ratio}× baseline · Night {Math.round(a.f.night_access_ratio * 100)}% · Denied {a.f.denied_access_count}
              </small>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

export function Detail({ S, act, a }: P & { a: AppState }) {
  const rs = recs(a);
  const B = ({ p, st, l }: { p: string; st: Status; l: string }) => (
    <button className="btn" disabled={a.perms[p] === st} onClick={() => act.perm(a.id, p, st)}>
      {l}
    </button>
  );

  return (
    <>
      <p>
        <a href="#apps" style={{ color: "var(--acc)", textDecoration: "none" }}>
          ← Back to applications
        </a>
      </p>

      {/* Profile Header */}
      <div className="card app" style={{ cursor: "default", marginBottom: 14 }}>
        <Ring t={a.trust} s={84} />
        <div className="t">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{a.icon} {a.name}</h2>
            <span className="badge" style={{ color: tc(a.trust) }}>
              {lvl(a.trust)} · {a.trust}% Trust Score
            </span>
            <span className="chip" style={{ borderLeftColor: a.monitoringMode === "manual" ? "var(--warn)" : "var(--good)" }}>
              Mode: {a.monitoringMode === "manual" ? "Manual Sliders Active" : "Automatic Monitoring"}
            </span>
          </div>
          <small style={{ color: "var(--mut)", display: "block", marginTop: 4 }}>
            ML Model Engine: {a.predictionSource || "GradientBoosting Regressor"} · Expected Permissions: {a.exp.map(p => PN[p] || p).join(", ")}
          </small>
        </div>
        {a.monitoringMode === "manual" && (
          <button
            className="btn"
            style={{ marginLeft: "auto" }}
            onClick={() => act.resetApp?.(a.id)}
          >
            ↺ Reset Sliders to Baseline
          </button>
        )}
      </div>

      <div className="grid g2">
        {/* Permission Governance */}
        <div className="card">
          <h3>Declared &amp; Active Permissions</h3>
          {Object.entries(a.perms).map(([p, st]) => (
            <div className="perm" key={p}>
              <div>
                <b>{PN[p] || p}</b> <span className={`chip ${st}`}>{st}</span>
                {!a.exp.includes(p) && (
                  <small style={{ color: "var(--bad)", display: "block" }}>
                    ⚠ Unexpected: Not declared in initial application scope
                  </small>
                )}
              </div>
              <div className="b">
                <B p={p} st="approved" l="Approve" />
                <B p={p} st="restricted" l="Restrict" />
                <B p={p} st="suspended" l="Suspend" />
                <B p={p} st="revoked" l="Revoke" />
              </div>
            </div>
          ))}
        </div>

        {/* Trust Trend & Recommendations */}
        <div className="card">
          <h3>Trust Score History</h3>
          <Chart ser={[{ c: a.col, n: a.name, d: a.hist }]} />
          <h3 style={{ marginTop: 14 }}>Security Recommendations</h3>
          {rs.length ? (
            rs.map(r => <RecItem key={r.perm} S={S} r={r} act={act} />)
          ) : (
            <Empty>No active recommendations. Risk score is within normal parameters.</Empty>
          )}
        </div>
      </div>

      {/* Interactive ML Feature Sliders */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Behavioral Telemetry &amp; ML Sliders</h3>
            <small style={{ color: "var(--mut)" }}>
              Adjust features below, then click <b>Simulate via ML</b> to send the values to the Python ML model and get a real trust score.
            </small>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn pri"
              disabled={a.mlPending}
              title="Send current slider values to the Python ML model (port 8000)"
              onClick={() => act.simulateML?.(a.id)}
            >
              {a.mlPending ? "⏳ Running ML…" : "🤖 Simulate via ML"}
            </button>
            <button
              className="btn"
              onClick={() => act.resetApp?.(a.id)}
            >
              Reset Sliders
            </button>
          </div>
        </div>

        {/* ML Error Banner */}
        {a.mlError && (
          <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--bad)", color: "#fff", borderRadius: 6, fontSize: 13 }}>
            ⚠️ {a.mlError}
          </div>
        )}

        {/* Feature Sliders Grid */}
        <div className="grid g3">
          {FEATURE_NAMES.map(k => {
            const meta = FEATURE_METADATA[k];
            const val = a.f[k] ?? meta.defaultValue;
            return (
              <div key={k} className="slider-card">
                <div className="head">
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{meta.label}</span>
                  <b style={{ color: "var(--acc)", fontSize: 14 }}>{meta.format(val)}</b>
                </div>
                <input
                  type="range"
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  value={val}
                  onChange={e => {
                    const parsed = parseFloat(e.target.value);
                    act.feature?.(a.id, k, parsed);
                  }}
                />
                <small style={{ color: "var(--mut)", fontSize: 11 }}>{meta.description}</small>
              </div>
            );
          })}
        </div>

        {/* ML Explainability & Attribution */}
        <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--p2)", borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <b>ML Decision Analysis:</b>
            <span className="badge" style={{ color: tc(a.trust) }}>
              {a.trust.toFixed(1)}% TRUST
            </span>
            {a.mlReasons.length > 0 ? (
              <span style={{ color: "var(--bad)", fontSize: 12, fontWeight: 700 }}>⚠️ Anomaly Detected</span>
            ) : (
              <span style={{ color: "var(--good)", fontSize: 12, fontWeight: 700 }}>✓ Normal Pattern</span>
            )}
            <span style={{ color: "var(--mut)", fontSize: 11, marginLeft: "auto" }}>
              Source: {a.predictionSource}
            </span>
          </div>
          {a.mlReasons.length > 0 ? (
            <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 13, color: "var(--text)" }}>
              {a.mlReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <small style={{ color: "var(--mut)" }}>
              {a.mlPending
                ? "⏳ Waiting for ML model response…"
                : "Application behavior is consistent with standard baseline patterns. No statistical anomalies detected."}
            </small>
          )}
        </div>
      </div>

      {/* Recent Access Feed */}
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Recent Access Telemetry</h3>
        {S.log.filter(e => e.app === a.id).slice(0, 10).map((e, i) => (
          <LogRow key={i} S={S} e={e} />
        ))}
      </div>
    </>
  );
}

export function Alerts({ S, act }: P) {
  const r = allRecs(S);
  return (
    <div className="grid g2">
      <div className="card">
        <h3>AI Security Recommendations</h3>
        {r.length ? (
          r.map(x => <RecItem key={x.app + x.perm} S={S} r={x} act={act} />)
        ) : (
          <Empty>No recommended actions. All applications are behaving normally.</Empty>
        )}
        {r.length > 0 && (
          <p>
            <button className="btn pri" onClick={act.all}>
              Apply all recommendations
            </button>
          </p>
        )}
      </div>
      <div className="card">
        <h3>Active System Alerts</h3>
        {S.alerts.length ? (
          S.alerts.slice(0, 15).map(x => <AlertItem key={x.id} S={S} x={x} act={act} />)
        ) : (
          <Empty>No alerts. All application behavior is currently normal.</Empty>
        )}
      </div>
    </div>
  );
}

export function Activity({ S }: { S: Sim }) {
  const [app, setApp] = useState("all");
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const ql = q.toLowerCase();

  const l = S.log.filter(e =>
    (app === "all" || e.app === app) &&
    (type === "all" || (type === "denied" ? e.kind === "access" && !e.ok : e.kind === type)) &&
    (!ql || `${PN[e.perm || ""] || ""} ${e.reason || ""} ${e.msg || ""}`.toLowerCase().includes(ql))
  ).slice(0, 80);

  return (
    <>
      <h2>Audit &amp; Access Activity</h2>
      <div className="fl">
        <select value={app} onChange={e => setApp(e.target.value)}>
          <option value="all">All apps</option>
          {S.apps.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="all">All events</option>
          <option value="access">Access</option>
          <option value="denied">Denied</option>
          <option value="alert">Alerts</option>
          <option value="change">Permission changes</option>
        </select>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search permission or reason..."
          style={{ flex: 1, minWidth: 180 }}
        />
      </div>
      <div className="card">
        {l.length ? l.map((e, i) => <LogRow key={i} S={S} e={e} />) : <Empty>No events match these filters.</Empty>}
      </div>
    </>
  );
}

export { getApp };
