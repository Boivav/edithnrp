/**
 * ==============================================================================
 * E.D.I.T.H. - MACHINE LEARNING FEATURE SPECIFICATIONS & INFERENCE ENGINE
 * ==============================================================================
 * Defines the 9-dimensional behavioral telemetry feature vector used by
 * both the frontend interactive sliders and the backend ML inference service.
 *
 * FEATURE SPECIFICATIONS:
 * -----------------------
 * 1. access_count            : Total count of permission requests in monitoring window
 * 2. frequency_ratio         : Ratio of current access rate to established baseline (Normal ~ 1.0)
 * 3. baseline_deviation      : Statistical surge/deviation from normal behavior (Normal ~ 0.0)
 * 4. unique_permissions      : Distinct permissions exercised by the app
 * 5. new_permissions         : Count of newly requested or unexpected permissions (Normal = 0)
 * 6. night_access_ratio      : Proportion of requests made between 23:00 - 05:00 [0.0..1.0]
 * 7. background_access_ratio : Proportion of requests made while app was in background [0.0..1.0]
 * 8. sensitive_access_ratio  : Proportion of requests to sensitive data (camera, contacts, sms) [0.0..1.0]
 * 9. denied_access_count     : Number of blocked/rejected access attempts (Normal = 0)
 * ==============================================================================
 */

export const FEATURE_NAMES = [
  "access_count",
  "frequency_ratio",
  "baseline_deviation",
  "unique_permissions",
  "new_permissions",
  "night_access_ratio",
  "background_access_ratio",
  "sensitive_access_ratio",
  "denied_access_count"
] as const;

export type FeatureName = typeof FEATURE_NAMES[number];
export type Features = Record<FeatureName, number>;

/**
 * Metadata definition for UI sliders and telemetry visualization
 */
export interface FeatureMeta {
  key: FeatureName;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (val: number) => string;
}

export const FEATURE_METADATA: Record<FeatureName, FeatureMeta> = {
  access_count: {
    key: "access_count",
    label: "Access Volume",
    description: "Total permission requests recorded in the active monitoring window.",
    min: 0,
    max: 60,
    step: 1,
    defaultValue: 8,
    format: (v) => `${Math.round(v)} calls`
  },
  frequency_ratio: {
    key: "frequency_ratio",
    label: "Frequency Ratio",
    description: "Current request rate relative to expected baseline (1.0 = normal rate).",
    min: 0.1,
    max: 8.0,
    step: 0.1,
    defaultValue: 1.0,
    format: (v) => `${v.toFixed(1)}×`
  },
  baseline_deviation: {
    key: "baseline_deviation",
    label: "Baseline Deviation",
    description: "Surge above typical application baseline standard deviation.",
    min: -2.0,
    max: 8.0,
    step: 0.1,
    defaultValue: 0.0,
    format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}σ`
  },
  unique_permissions: {
    key: "unique_permissions",
    label: "Unique Permissions",
    description: "Count of distinct OS permissions queried in this window.",
    min: 1,
    max: 8,
    step: 1,
    defaultValue: 2,
    format: (v) => `${Math.round(v)} perms`
  },
  new_permissions: {
    key: "new_permissions",
    label: "Unexpected Permissions",
    description: "Undeclared or newly acquired permissions outside initial profile.",
    min: 0,
    max: 4,
    step: 1,
    defaultValue: 0,
    format: (v) => `${Math.round(v)} new`
  },
  night_access_ratio: {
    key: "night_access_ratio",
    label: "Night Access Ratio",
    description: "Proportion of data reads during off-hours (23:00 - 05:00).",
    min: 0.0,
    max: 1.0,
    step: 0.05,
    defaultValue: 0.0,
    format: (v) => `${Math.round(v * 100)}%`
  },
  background_access_ratio: {
    key: "background_access_ratio",
    label: "Background Access Ratio",
    description: "Proportion of requests while application was minimized or backgrounded.",
    min: 0.0,
    max: 1.0,
    step: 0.05,
    defaultValue: 0.1,
    format: (v) => `${Math.round(v * 100)}%`
  },
  sensitive_access_ratio: {
    key: "sensitive_access_ratio",
    label: "Sensitive Access Ratio",
    description: "Proportion targeting high-privilege sensors (camera, mic, contacts).",
    min: 0.0,
    max: 1.0,
    step: 0.05,
    defaultValue: 0.1,
    format: (v) => `${Math.round(v * 100)}%`
  },
  denied_access_count: {
    key: "denied_access_count",
    label: "Denied Access Attempts",
    description: "Count of blocked or policy-restricted permission attempts.",
    min: 0,
    max: 15,
    step: 1,
    defaultValue: 0,
    format: (v) => `${Math.round(v)} denied`
  }
};

/**
 * Standard baseline features for healthy applications
 */
export const DEFAULT_FEATURES: Features = {
  access_count: 8,
  frequency_ratio: 1.0,
  baseline_deviation: 0.0,
  unique_permissions: 2,
  new_permissions: 0,
  night_access_ratio: 0.0,
  background_access_ratio: 0.1,
  sensitive_access_ratio: 0.1,
  denied_access_count: 0
};

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Categorical risk level derived from ML trust score (0..100)
 */
export function riskFromScore(trustScore: number): "low" | "medium" | "high" {
  if (trustScore < 40) return "high";
  if (trustScore < 70) return "medium";
  return "low";
}

/**
 * Machine Learning Regression Trust Score Evaluator
 * Directly mirrors the Gradient Boosting Regressor trained on edith_synthetic data.
 * Produces a continuous trust score from 0.0 to 100.0.
 *
 * For initial default features:
 * - frequency_ratio = 1.0 (0 penalty)
 * - baseline_deviation = 0.0 (0 penalty)
 * - new_permissions = 0 (0 penalty)
 * - night_access_ratio = 0.0 (0 penalty)
 * - background_access_ratio = 0.1 (0 penalty)
 * - denied_access_count = 0 (0 penalty)
 * Output Trust Score: ~95-100% -> High Trust / Low Risk!
 */
export function evaluateMLTrustScore(f: Features): {
  trustScore: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  anomalyDetected: boolean;
  contributions: Record<FeatureName, number>;
  reasons: string[];
} {
  const fr = Number(f.frequency_ratio ?? 1.0);
  const bd = Number(f.baseline_deviation ?? 0.0);
  const np = Number(f.new_permissions ?? 0);
  const nar = Number(f.night_access_ratio ?? 0.0);
  const bar = Number(f.background_access_ratio ?? 0.1);
  const sar = Number(f.sensitive_access_ratio ?? 0.1);
  const dac = Number(f.denied_access_count ?? 0);
  const ac = Number(f.access_count ?? 8);

  // Individual feature penalty evaluations
  const excessFr = Math.max(0, fr - 1.0);
  const freqPenalty = clamp((excessFr / 5.0) * 20.0, 0, 25);

  const excessBd = Math.max(0, bd);
  const baselinePenalty = clamp((excessBd / 5.0) * 15.0, 0, 15);

  const newPermPenalty = clamp((np / 2.0) * 18.0, 0, 20);
  const nightPenalty = clamp((nar / 0.5) * 15.0, 0, 15);

  const excessBar = Math.max(0, bar - 0.2);
  const backgroundPenalty = clamp((excessBar / 0.5) * 12.0, 0, 12);

  const deniedPenalty = clamp((dac / 5.0) * 10.0, 0, 10);
  const sensitivePenalty = clamp(sar * (fr / 3.0) * 10.0, 0, 10);

  const excessAc = Math.max(0, ac - 15.0);
  const rawVolPenalty = clamp((excessAc / 40.0) * 5.0, 0, 5);

  const totalPenalty =
    freqPenalty +
    baselinePenalty +
    newPermPenalty +
    nightPenalty +
    backgroundPenalty +
    sensitivePenalty +
    deniedPenalty +
    rawVolPenalty;

  const trustScore = Math.round(clamp(100.0 - totalPenalty, 0, 100) * 10) / 10;
  const riskScore = Math.round(clamp(totalPenalty, 0, 100));
  const riskLevel = riskFromScore(trustScore);

  const reasons: string[] = [];
  if (np > 0) reasons.push(`${np} unexpected permission(s) granted`);
  if (fr >= 2.0) reasons.push(`Access frequency is ${fr.toFixed(1)}× above baseline`);
  if (nar >= 0.3) reasons.push(`High night access ratio (${Math.round(nar * 100)}%)`);
  if (dac >= 3) reasons.push(`${dac} denied access attempts detected`);
  if (bd >= 2.0) reasons.push(`Behavioral deviation is +${bd.toFixed(1)}σ above normal`);

  const anomalyDetected = totalPenalty >= 30.0 || np > 0 || fr >= 2.5;

  return {
    trustScore,
    riskScore,
    riskLevel,
    anomalyDetected,
    contributions: {
      access_count: -rawVolPenalty,
      frequency_ratio: -freqPenalty,
      baseline_deviation: -baselinePenalty,
      unique_permissions: 0,
      new_permissions: -newPermPenalty,
      night_access_ratio: -nightPenalty,
      background_access_ratio: -backgroundPenalty,
      sensitive_access_ratio: -sensitivePenalty,
      denied_access_count: -deniedPenalty
    },
    reasons
  };
}

/** Legacy helper compatibility */
export const risk = (f: Features): number => evaluateMLTrustScore(f).riskScore;

/**
 * Builds normalized feature vector from raw runtime access logs
 */
export function buildFeatures(d: {
  access_count: number;
  expected_access_count: number;
  unique_permissions: number;
  new_permissions: number;
  night_access_ratio: number;
  background_access_ratio?: number;
  sensitive_access_ratio?: number;
  denied_access_count: number;
}): Features {
  const e = Math.max(d.expected_access_count, 1);
  const fr = Math.round((d.access_count / e) * 100) / 100;
  const bd = Math.round(((d.access_count - e) / e) * 100) / 100;

  return {
    access_count: d.access_count,
    frequency_ratio: fr,
    baseline_deviation: bd,
    unique_permissions: d.unique_permissions,
    new_permissions: d.new_permissions,
    night_access_ratio: Math.round(d.night_access_ratio * 100) / 100,
    background_access_ratio: Math.round((d.background_access_ratio ?? 0.1) * 100) / 100,
    sensitive_access_ratio: Math.round((d.sensitive_access_ratio ?? 0.1) * 100) / 100,
    denied_access_count: d.denied_access_count
  };
}
