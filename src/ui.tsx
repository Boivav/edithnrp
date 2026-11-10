/**
 * ==============================================================================
 * E.D.I.T.H. - UI COMPONENTS & VISUAL ELEMENTS
 * ==============================================================================
 */

import { Sim, AppState, LogItem, Alert, Rec, PN, getApp, Status } from "./engine";
import { FeatureName } from "./ml/features";

export const tc = (t: number) => t >= 75 ? "var(--good)" : t >= 50 ? "var(--warn)" : "var(--bad)";
export const lvl = (t: number) => t >= 75 ? "Low risk" : t >= 50 ? "Medium risk" : "High risk";
export const tm = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });

export function Ring({ t, s = 64 }: { t: number; s?: number }) {
  const safeT = Math.max(0, Math.min(100, t));
  return (
    <svg width={s} height={s} viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r="15.5"
        fill="none"
        stroke={tc(safeT)}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${(safeT * 0.974).toFixed(1)} 100`}
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="21.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text)">
        {Math.round(safeT)}
      </text>
    </svg>
  );
}

export function Chart({ ser }: { ser: { c: string; n: string; d: number[] }[] }) {
  const w = 600, h = 170, y = (v: number) => h - 4 - (Math.max(0, Math.min(100, v)) / 100) * (h - 8);
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
        {[25, 50, 75].map(v => (
          <line key={v} x1="0" x2={w} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
        ))}
        {ser.map(s => {
          if (!s.d || s.d.length === 0) return null;
          const points = s.d.map((v, i) => `${(i * w / Math.max(s.d.length - 1, 1)).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return <polyline key={s.n} fill="none" stroke={s.c} strokeWidth="2.2" strokeLinejoin="round" points={points} />;
        })}
      </svg>
      <div className="leg">
        {ser.map(s => <span key={s.n}><i style={{ background: s.c }} />{s.n}</span>)}
        <span>Trust score, 0 to 100 (dashed lines at 25, 50, 75)</span>
      </div>
    </>
  );
}

export const Chips = ({ a }: { a: AppState }) => (
  <>
    {Object.entries(a.perms).map(([p, st]) => {
      const exp = a.exp.includes(p);
      return (
        <span key={p} className={`chip ${st} ${exp ? "" : "x"}`}>
          {exp ? "" : "⚠ "}{PN[p] || p} · {st}
        </span>
      );
    })}
  </>
);

export type Act = {
  perm: (app: string, p: string, st: Status) => void;
  all: () => void;
  dismiss: (id: number) => void;
  feature?: (app: string, feat: FeatureName, val: number) => void;
  resetApp?: (app: string) => void;
  simulateML?: (app: string) => void;
};

export const RecItem = ({ S, r, act }: { S: Sim; r: Rec; act: Act }) => (
  <div className="rec">
    <div>
      <b>{r.st === "revoked" ? "Revoke" : r.st === "suspended" ? "Suspend" : "Restrict"} {PN[r.perm] || r.perm}</b> on {getApp(S, r.app).name}
      <small>{r.why}</small>
    </div>
    <button className="btn pri" onClick={() => act.perm(r.app, r.perm, r.st)}>Apply</button>
  </div>
);

export const AlertItem = ({ S, x, act }: { S: Sim; x: Alert; act?: Act }) => (
  <div className="al">
    <span className={`sev ${x.sev}`} />
    <div style={{ flex: 1 }}>
      <b>{getApp(S, x.app).name}</b> {x.msg}
      <small>{tm(x.t)} · {x.state}</small>
    </div>
    {act && x.state === "open" && <button className="btn" onClick={() => act.dismiss(x.id)}>Dismiss</button>}
  </div>
);

export const LogRow = ({ S, e }: { S: Sim; e: LogItem }) => {
  const name = getApp(S, e.app).name;
  return (
    <div className="log">
      <time>{tm(e.t)}</time>
      <span>
        {e.kind === "access" ? (
          <>{e.ok ? "✅" : "⛔"} <b>{name}</b> read {PN[e.perm || ""] || e.perm}{e.ok ? "" : " (denied)"} · {e.reason}{e.night ? " · night" : ""}</>
        ) : e.kind === "alert" ? (
          <>⚠️ <b>{name}</b> {e.msg}</>
        ) : (
          <>🔧 <b>{name}</b> {e.msg}</>
        )}
      </span>
    </div>
  );
};
