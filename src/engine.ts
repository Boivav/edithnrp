/**
 * ==============================================================================
 * E.D.I.T.H. - CORE SIMULATION & PERMISSION MANAGEMENT ENGINE
 * ==============================================================================
 * Manages runtime state, event simulation, access auditing, ML trust scoring,
 * anomaly rule detection, and backend synchronization.
 * ==============================================================================
 */

import {
  Features,
  DEFAULT_FEATURES,
  evaluateMLTrustScore,
  buildFeatures,
  clamp,
  riskFromScore,
  FeatureName
} from "./ml/features";
import {
  sendManualFeatures,
  sendAutomaticMetrics,
  resetMonitoringMode,
  updateBackendPermission,
  recordAccessEvent,
  predictWithML
} from "./api";

export type Status = "approved" | "restricted" | "suspended" | "revoked";
export const W = 10;

/** Friendly display names for permissions */
export const PN: Record<string, string> = {
  contacts: "Contacts",
  camera: "Camera",
  location: "Location",
  microphone: "Microphone",
  storage: "Storage",
  calendar: "Calendar",
  sms: "SMS",
  health: "Health Data"
};

const REASON: Record<string, string> = {
  storage: "Sync files & offline notes",
  calendar: "Read upcoming events",
  camera: "Capture photo",
  location: "Tag location",
  contacts: "Bulk contact read",
  microphone: "Background audio capture",
  sms: "Read messages",
  health: "Sync workout statistics"
};

export interface LogItem {
  kind: "access" | "alert" | "change";
  t: number;
  app: string;
  tick?: number;
  perm?: string;
  ok?: boolean;
  night?: boolean;
  reason?: string;
  msg?: string;
  sev?: string;
}

export interface AppState {
  id: string;
  name: string;
  icon: string;
  exp: string[];
  off: number;
  col: string;
  perms: Record<string, Status>;
  win: LogItem[];
  trust: number;
  hist: number[];
  rogue: boolean;
  f: Features;
  un: string[];
  risk: number;
  monitoringMode: "automatic" | "manual";
  mlReasons: string[];
  predictionSource: string;
  /** Rogue escalation stage: 0 = normal, 1-4 = progressively worsening */
  rogueStage: number;
  /** True while awaiting ML response from "Simulate via ML" button */
  mlPending: boolean;
  /** Last error from ML endpoint, if any */
  mlError: string | null;
}

export interface Alert {
  id: number;
  app: string;
  type: string;
  sev: "high" | "medium";
  msg: string;
  t: number;
  state: "open" | "dismissed" | "resolved";
}

export interface Rec {
  app: string;
  perm: string;
  st: Status;
  why: string;
}

export interface Sim {
  T: number;
  aid: number;
  run: boolean;
  log: LogItem[];
  alerts: Alert[];
  apps: AppState[];
  backendConnected: boolean;
}

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export const getApp = (S: Sim, id: string): AppState => S.apps.find(a => a.id === id || a.id.toLowerCase() === id.toLowerCase()) || S.apps[0];

/**
 * Initializes the simulation state with all applications showing GOOD trust initially.
 * Zero high-risk alerts automatically, clean normal historical trendlines.
 */
export function createSim(): Sim {
  const mk = (
    id: string,
    name: string,
    icon: string,
    exp: string[],
    initialTrust: number,
    col: string
  ): AppState => {
    // Generate clean baseline history
    const baseHist = Array.from({ length: 30 }, (_, i) => initialTrust - (i % 2 === 0 ? 0.3 : -0.2));
    return {
      id,
      name,
      icon,
      exp,
      off: 0,
      col,
      perms: Object.fromEntries(exp.map(p => [p, "approved" as Status])),
      win: [],
      trust: initialTrust,
      hist: baseHist,
      rogue: false,
      f: { ...DEFAULT_FEATURES, access_count: exp.length * 4 },
      un: [],
      risk: 0,
      monitoringMode: "automatic",
      mlReasons: [],
      predictionSource: "ml-model-engine",
      rogueStage: 0,
      mlPending: false,
      mlError: null
    };
  };

  const S: Sim = {
    T: 0,
    aid: 0,
    run: true,
    log: [
      { kind: "change", t: Date.now() - 5000, app: "lumen", msg: "Initialized with baseline security permissions" },
      { kind: "change", t: Date.now() - 4000, app: "pixel", msg: "Initialized with baseline security permissions" },
      { kind: "change", t: Date.now() - 3000, app: "fit", msg: "Initialized with baseline security permissions" }
    ],
    alerts: [], // Clean initial state: zero alerts open
    apps: [
      mk("lumen", "Lumen Notes", "📝", ["storage", "calendar"], 96.0, "#2cc8ff"),
      mk("pixel", "PixelShare", "📷", ["camera", "storage", "location"], 94.0, "#ffc233"),
      mk("fit", "FitTrack", "🏃", ["location", "calendar"], 97.0, "#b88cff")
    ],
    backendConnected: false
  };

  return S;
}

/**
 * Executes one clock cycle of telemetry generation and ML evaluation
 */
export function tick(S: Sim, ts = Date.now()) {
  S.T++;

  for (const a of S.apps) {
    // 1. If manual slider mode is active, do not allow automatic events to mutate feature sliders
    if (a.monitoringMode === "manual") {
      const ml = evaluateMLTrustScore(a.f);
      a.trust = ml.trustScore;
      a.risk = ml.riskScore;
      a.mlReasons = ml.reasons;
      a.hist.push(a.trust);
      if (a.hist.length > 60) a.hist.shift();
      watch(S, a, ts);
      continue;
    }

    // 2. Advance rogue escalation stage gradually (one stage per tick)
    if (a.rogueStage >= 1 && a.rogueStage < 4) {
      advanceRogueStage(S, a);
    }

    // 3. Normal automatic event generation
    const n = a.rogue ? rand(3, 5) : Math.random() < 0.25 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const extra = Object.keys(a.perms).filter(p => !a.exp.includes(p));
      const perm = a.rogue && extra.length && Math.random() < 0.6 ? pick(extra) : pick(a.exp);
      const st = a.perms[perm] || "approved";
      const ok = st === "approved" || (st === "restricted" && Math.random() < 0.2);
      const isNight = a.rogue ? Math.random() < 0.6 : false; // Healthy apps do not generate night access
      const ev: LogItem = {
        kind: "access",
        t: ts,
        tick: S.T,
        app: a.id,
        perm,
        ok,
        night: isNight,
        reason: REASON[perm] || "Standard resource read"
      };
      a.win.push(ev);
      S.log.unshift(ev);

      // Async forward to backend
      recordAccessEvent({
        appId: a.id,
        permission: PN[perm] || perm,
        status: ok ? "allowed" : "denied",
        purpose: ev.reason,
        source: "automatic"
      });
    }

    a.win = a.win.filter(e => e.tick! > S.T - W);
    const okEvents = a.win.filter(e => e.ok);
    a.un = [...new Set(okEvents.map(e => e.perm!).filter(p => !a.exp.includes(p)))];

    // Build features for healthy or rogue behavior
    if (a.rogue) {
      a.f = buildFeatures({
        access_count: okEvents.length,
        expected_access_count: 8,
        unique_permissions: new Set(okEvents.map(e => e.perm)).size,
        new_permissions: a.un.length,
        night_access_ratio: okEvents.length ? okEvents.filter(e => e.night).length / okEvents.length : 0,
        background_access_ratio: 0.65,
        sensitive_access_ratio: 0.75,
        denied_access_count: a.win.length - okEvents.length
      });
    } else {
      // Normal apps stay healthy with high trust
      a.f = {
        ...DEFAULT_FEATURES,
        access_count: Math.max(4, okEvents.length),
        frequency_ratio: 1.0,
        baseline_deviation: 0.0,
        new_permissions: 0,
        night_access_ratio: 0.0,
        denied_access_count: 0
      };
    }

    // 3. Evaluate Trust Score with ML model
    const ml = evaluateMLTrustScore(a.f);
    a.risk = ml.riskScore;
    a.mlReasons = ml.reasons;

    // Smooth trust score update toward ML prediction target
    const targetTrust = ml.trustScore;
    a.trust = Math.round((a.trust + (targetTrust - a.trust) * 0.4) * 10) / 10;
    a.hist.push(a.trust);
    if (a.hist.length > 60) a.hist.shift();

    // Async forward metrics to backend ML endpoint
    sendAutomaticMetrics(a.id, a.f);

    watch(S, a, ts);
  }

  if (S.log.length > 500) S.log.length = 500;
}

/**
 * Anomaly detector & alert watcher
 */
function watch(S: Sim, a: AppState, ts: number) {
  const f = a.f;
  const C: Record<string, [boolean, "high" | "medium", string]> = {
    freq: [f.frequency_ratio >= 2.5, "high", `Access frequency is ${f.frequency_ratio}× its baseline`],
    unexp: [f.new_permissions > 0, "high", `Using unexpected permissions: ${a.un.map(p => PN[p] || p).join(", ")}`],
    night: [f.night_access_ratio >= 0.4 && f.access_count >= 10, "medium", `High night-time access (${Math.round(f.night_access_ratio * 100)}% of requests)`],
    deny: [f.denied_access_count >= 4, "medium", `${f.denied_access_count} denied access attempts in recent window`]
  };

  for (const k in C) {
    const o = S.alerts.find(x => x.app === a.id && x.type === k && x.state !== "resolved");
    const [condition, sev, msg] = C[k];
    if (condition && !o) {
      S.alerts.unshift({ id: ++S.aid, app: a.id, type: k, sev, msg, t: ts, state: "open" });
      S.log.unshift({ kind: "alert", t: ts, app: a.id, msg, sev });
    } else if (condition && o && o.state === "open") {
      o.msg = msg;
    } else if (!condition && o) {
      o.state = "resolved";
    }
  }
}

/**
 * Security recommendations derived from ML risk and permission scope
 */
export function recs(a: AppState): Rec[] {
  const r: Rec[] = [];
  if (a.risk < 25 && a.trust >= 75) return r;

  for (const [p, st] of Object.entries(a.perms)) {
    if (st === "revoked" || st === "suspended") continue;
    if (!a.exp.includes(p)) {
      r.push({ app: a.id, perm: p, st: "revoked", why: `Not part of ${a.name}’s normal declared behavior` });
    } else if (st === "approved" && a.f.frequency_ratio >= 2.2) {
      r.push({ app: a.id, perm: p, st: "restricted", why: `Access rate is ${a.f.frequency_ratio}× baseline` });
    } else if (st === "approved" && a.trust < 40) {
      r.push({ app: a.id, perm: p, st: "suspended", why: `High-risk ML trust score (${a.trust}%). Temporarily suspend access.` });
    }
  }
  return r;
}

export const allRecs = (S: Sim) => S.apps.flatMap(recs);

/**
 * Updates a permission's enforcement policy
 */
export function setPerm(S: Sim, id: string, p: string, st: Status) {
  const a = getApp(S, id);
  a.perms[p] = st;
  S.log.unshift({ kind: "change", t: Date.now(), app: id, msg: `You set ${PN[p] || p} to ${st}` });

  // Update backend
  updateBackendPermission(id, PN[p] || p, st);

  // If user revoked unexpected permissions, update telemetry
  const unexp = Object.keys(a.perms).filter(perm => !a.exp.includes(perm) && a.perms[perm] === "approved");
  a.un = unexp;
  a.f.new_permissions = unexp.length;
  if (unexp.length === 0 && a.rogue) {
    a.rogue = false;
    a.f.frequency_ratio = 1.2;
    a.f.night_access_ratio = 0.05;
  }
  const ml = evaluateMLTrustScore(a.f);
  a.trust = ml.trustScore;
  a.risk = ml.riskScore;
}

/**
 * User updates a feature slider manually
 */
export function setManualFeature(S: Sim, appId: string, feature: FeatureName, value: number) {
  const a = getApp(S, appId);
  a.monitoringMode = "manual";
  a.f[feature] = value;

  // Evaluate trust score immediately with ML model
  const ml = evaluateMLTrustScore(a.f);
  a.trust = ml.trustScore;
  a.risk = ml.riskScore;
  a.mlReasons = ml.reasons;
  a.hist.push(a.trust);
  if (a.hist.length > 60) a.hist.shift();

  // Watch for anomalies under new slider values
  watch(S, a, Date.now());

  // Forward to backend
  sendManualFeatures(appId, a.f).then(res => {
    if (res && res.trustScore !== undefined) {
      a.trust = res.trustScore;
      a.predictionSource = res.predictionSource || "ml-service";
    }
  });
}

/**
 * Resets an application's features back to default baseline and automatic monitoring mode
 */
export function resetAppToBaseline(S: Sim, appId: string) {
  const a = getApp(S, appId);
  a.monitoringMode = "automatic";
  a.rogue = false;
  a.rogueStage = 0;
  a.mlPending = false;
  a.mlError = null;
  a.f = { ...DEFAULT_FEATURES };
  a.un = [];

  const ml = evaluateMLTrustScore(a.f);
  a.trust = ml.trustScore;
  a.risk = ml.riskScore;
  a.mlReasons = [];
  a.predictionSource = "ml-model-engine";

  // Resolve open alerts for this app
  for (const alert of S.alerts) {
    if (alert.app === appId && alert.state === "open") {
      alert.state = "resolved";
    }
  }

  // Notify backend
  resetMonitoringMode(appId);
}

/**
 * Demo scenario: PixelShare begins requesting extra permissions and gradually
 * escalates suspicious behaviour across 4 stages, one per tick.
 * Stage 0: normal baseline
 * Stage 1: requests unexpected permissions (contacts, microphone, sms)
 * Stage 2: access frequency starts rising
 * Stage 3: night/background access kicks in, sensitive ratio climbs
 * Stage 4: full rogue - high frequency, high denial count, peak anomaly
 */
export function triggerRogue(S: Sim) {
  const a = getApp(S, "pixel");
  a.rogueStage = 1;

  // Stage 1 immediately: request extra permissions
  for (const p of ["contacts", "microphone", "sms"]) {
    a.perms[p] = "approved";
    S.log.unshift({
      kind: "change",
      t: Date.now(),
      app: a.id,
      msg: `requested ${PN[p]} in an update and was granted it`
    });
  }
  a.un = ["contacts", "microphone", "sms"];
  a.f.new_permissions = 3;

  // Mark rogue so the tick loop uses rogue event generation
  a.rogue = true;
}

/**
 * Advances PixelShare's rogue escalation by one stage per call.
 * Called once per tick whenever a.rogueStage >= 1 and < 4.
 */
export function advanceRogueStage(S: Sim, a: AppState) {
  if (a.rogueStage <= 0 || a.rogueStage >= 4) return;
  a.rogueStage++;

  if (a.rogueStage === 2) {
    // Frequency starts climbing
    a.f.frequency_ratio = 2.2;
    a.f.access_count = 20;
    a.f.baseline_deviation = 1.5;
    S.log.unshift({ kind: "alert", t: Date.now(), app: a.id, sev: "medium",
      msg: "Access frequency climbing above baseline (2.2×)" });
  } else if (a.rogueStage === 3) {
    // Night & background access emerge
    a.f.frequency_ratio = 3.5;
    a.f.access_count = 32;
    a.f.baseline_deviation = 3.0;
    a.f.night_access_ratio = 0.45;
    a.f.background_access_ratio = 0.60;
    a.f.sensitive_access_ratio = 0.70;
    a.f.denied_access_count = 3;
    S.log.unshift({ kind: "alert", t: Date.now(), app: a.id, sev: "high",
      msg: "High night-time & background access detected — possible silent data harvesting" });
  } else if (a.rogueStage === 4) {
    // Full rogue: peak anomaly
    a.f.frequency_ratio = 6.0;
    a.f.access_count = 50;
    a.f.baseline_deviation = 6.0;
    a.f.night_access_ratio = 0.80;
    a.f.background_access_ratio = 0.85;
    a.f.sensitive_access_ratio = 0.90;
    a.f.denied_access_count = 8;
    S.log.unshift({ kind: "alert", t: Date.now(), app: a.id, sev: "high",
      msg: "CRITICAL: Full rogue behavior — severe permission abuse and mass denied attempts" });
  }
}

/**
 * Sends current slider feature values to the Python ML model via backend proxy.
 * Updates the app's trust score and risk level with real model output.
 */
export async function simulateViaML(
  S: Sim,
  appId: string,
  force: () => void
) {
  const a = getApp(S, appId);
  a.mlPending = true;
  a.mlError = null;
  force();

  try {
    const result = await predictWithML(appId, a.f);
    if (result && result.trust_score !== undefined && result.trust_score !== null) {
      a.trust = Number(result.trust_score);
      a.predictionSource = result.prediction_source || "ml-python-service";
      a.mlReasons = Array.isArray(result.reasons) ? result.reasons : [];
      a.hist.push(a.trust);
      if (a.hist.length > 60) a.hist.shift();
      a.mlError = null;
    } else {
      a.mlError = "ML model unavailable. Ensure ml/api.py is running on port 8000.";
    }
  } catch (err: any) {
    a.mlError = err.message || "ML prediction failed";
  } finally {
    a.mlPending = false;
    force();
  }
}
