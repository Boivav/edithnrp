/**
 * ==============================================================================
 * E.D.I.T.H. - MACHINE LEARNING MODEL API CONTROLLER
 * ==============================================================================
 * Proxies ML inference requests to the Python FastAPI ML microservice
 * (port 8000) and falls back to the built-in pure-Python ML engine when
 * the microservice is offline.
 *
 * - POST /api/ml/predict : Forwards feature vector to Python ML service and
 *                          returns trust score + anomaly attribution from
 *                          the trained edith_model.joblib (Gradient Boosting
 *                          Regressor + Isolation Forest).
 * - GET  /api/ml/info    : Returns feature specifications, model architecture,
 *                          and scoring thresholds.
 * ==============================================================================
 */

const { FEATURE_NAMES, riskFromScore } = require('../services/features');
const { getTrustPrediction } = require('../services/mlService');

/**
 * POST /api/ml/predict
 * Forwards the feature vector to the Python ML microservice (port 8000).
 * Returns real model output: trust_score, risk_level, anomaly_detected, reasons.
 */
async function predictTrustScore(req, res) {
  try {
    const rawData = req.body.data || req.body.features || req.body;
    let features = {};

    if (Array.isArray(rawData)) {
      const names = req.body.feature_names || FEATURE_NAMES;
      names.forEach((name, i) => {
        features[name] = rawData[i] ?? 0;
      });
    } else {
      features = { ...rawData };
      // Strip non-feature keys
      for (const k of Object.keys(features)) {
        if (!FEATURE_NAMES.includes(k)) delete features[k];
      }
    }

    const appId = req.body.app_id || 'unknown';
    const prediction = await getTrustPrediction(appId, features);

    res.json({
      trust_score: prediction.trustScore,
      risk_level: prediction.riskLevel,
      prediction_source: prediction.predictionSource,
      ...(prediction.modelDetails || {})
    });
  } catch (error) {
    res.status(400).json({
      message: 'Failed to process ML prediction',
      error: error.message
    });
  }
}

/**
 * GET /api/ml/info
 * Returns model specifications, feature weights, and contract documentation.
 */
function getModelInfo(req, res) {
  res.json({
    model_name: 'E.D.I.T.H. Trust & Anomaly Ensemble',
    version: '1.0.0',
    algorithm: 'Gradient Boosting Regressor + Isolation Forest (edith_model.joblib)',
    prediction_source: 'ml-python-service → ml-model-engine (fallback)',
    features: FEATURE_NAMES.map(name => ({
      name,
      description: getFeatureDescription(name)
    })),
    scoring_scale: {
      minimum: 0,
      maximum: 100,
      bands: [
        { band: 'High Trust (Low Risk)', range: '70 - 100' },
        { band: 'Moderate Trust (Medium Risk)', range: '40 - 69' },
        { band: 'Low Trust (High Risk)', range: '0 - 39' }
      ]
    }
  });
}

function getFeatureDescription(name) {
  const descriptions = {
    access_count: 'Total count of permission accesses in the time window',
    frequency_ratio: 'Ratio of current access count to established app baseline',
    baseline_deviation: 'Z-score surge from standard application behavioral baseline',
    unique_permissions: 'Number of distinct permissions accessed',
    new_permissions: 'Count of unexpected or newly introduced permissions',
    night_access_ratio: 'Proportion of requests occurring between 23:00 and 05:00',
    background_access_ratio: 'Proportion of accesses while application was in background',
    sensitive_access_ratio: 'Proportion of calls requesting high-sensitivity data',
    denied_access_count: 'Total number of rejected permission attempts'
  };
  return descriptions[name] || 'Behavioral telemetry feature';
}

module.exports = {
  predictTrustScore,
  getModelInfo
};
