// Keep this order and spelling identical to the FEATURE_NAMES used by the ML model.
const FEATURE_NAMES = [
  'access_count',
  'frequency_ratio',
  'baseline_deviation',
  'unique_permissions',
  'new_permissions',
  'night_access_ratio',
  'background_access_ratio',
  'sensitive_access_ratio',
  'denied_access_count'
];

const DEFAULT_FEATURES = {
  access_count: 8,
  frequency_ratio: 1,
  baseline_deviation: 0,
  unique_permissions: 2,
  new_permissions: 0,
  night_access_ratio: 0,
  background_access_ratio: 0.1,
  sensitive_access_ratio: 0.1,
  denied_access_count: 0
};

function normalizeFeatures(input = {}) {
  const output = {};
  for (const key of FEATURE_NAMES) {
    const value = Number(input[key] ?? DEFAULT_FEATURES[key]);
    if (!Number.isFinite(value) || value < 0) {
      const error = new Error(`Feature '${key}' must be a finite non-negative number`);
      error.status = 400;
      throw error;
    }
    output[key] = value;
  }
  // Ratios are expected in the 0..1 range. Reject rather than silently distort ML input.
  for (const key of ['night_access_ratio', 'background_access_ratio', 'sensitive_access_ratio']) {
    if (output[key] > 1) {
      const error = new Error(`${key} must be between 0 and 1`);
      error.status = 400;
      throw error;
    }
  }
  return output;
}

function riskFromScore(score) {
  if (score < 40) return 'high';
  if (score < 70) return 'medium';
  return 'low';
}

module.exports = { FEATURE_NAMES, DEFAULT_FEATURES, normalizeFeatures, riskFromScore };
