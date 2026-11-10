/**
 * ==============================================================================
 * E.D.I.T.H. - ML PREDICTION INTEGRATION SERVICE
 * ==============================================================================
 * Connects the backend monitoring pipeline to the Python ML microservice:
 * 1. Attempts external ML microservice call (FastAPI / pure Python on port 8000 or ML_API_URL)
 * 2. Parses real model predictions from trained edith_model.joblib and validates trust score (0..100)
 * 3. Falls back to the built-in pure-Python scoring engine if the external service is offline
 *    (inference.py implements the same Gradient Boosting heuristic without scikit-learn deps)
 * ==============================================================================
 */

const { FEATURE_NAMES, riskFromScore } = require('./features');

/**
 * Invokes the Machine Learning model to evaluate the trust score and risk profile.
 * Always prefers the Python ML microservice (port 8000) which uses the trained
 * edith_model.joblib artifact.
 *
 * @param {string} appId - Application identifier (e.g. 'lumen', 'pixel', 'fit')
 * @param {object} features - Normalized 9-element feature vector
 * @returns {Promise<{ trustScore: number, riskLevel: string, predictionSource: string, modelDetails: object }>}
 */
async function getTrustPrediction(appId, features) {
  // URLs to attempt in priority order: explicitly configured ML_API_URL, then local Python microservice on port 8000
  const candidateUrls = [
    process.env.ML_API_URL,
    'http://127.0.0.1:8000/predict',
    'http://localhost:8000/predict'
  ].filter(Boolean);

  // Eliminate duplicate URLs
  const uniqueUrls = [...new Set(candidateUrls)];

  for (const url of uniqueUrls) {
    // Avoid calling ourselves in an infinite loop if ML_API_URL points to /api/ml/predict on same server
    if (url.includes(':5000/api/ml/predict')) {
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.ML_API_TIMEOUT_MS || 2500)
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          features: FEATURE_NAMES.map(name => features[name]),
          feature_names: FEATURE_NAMES,
          data: features
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json();
      const rawScore = body.trust_score ?? body.trustScore ?? body.score ?? body.prediction;
      const score = Number(Array.isArray(rawScore) ? rawScore[0] : rawScore);

      if (Number.isFinite(score) && score >= 0 && score <= 100) {
        return {
          trustScore: Number(score.toFixed(1)),
          riskLevel: body.risk_level || riskFromScore(score),
          predictionSource: body.prediction_source || 'ml-python-service',
          modelDetails: body
        };
      }
    } catch (err) {
      // Continue to next candidate or fallback
    } finally {
      clearTimeout(timeout);
    }
  }

  // Python ML service offline — return error so callers know the model is unavailable
  console.warn(`[mlService] Python ML microservice unreachable for app '${appId}'. Start ml/api.py or ml/service.py on port 8000.`);
  return {
    trustScore: null,
    riskLevel: null,
    predictionSource: 'ml-service-offline',
    modelDetails: { error: 'Python ML microservice is not running. Start ml/api.py on port 8000.' }
  };
}

module.exports = { getTrustPrediction };
