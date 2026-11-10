/**
 * ==============================================================================
 * MONITORING & METRICS CONTROLLER
 * ==============================================================================
 * Ingests behavior telemetry from the client or background collectors, forwards
 * feature vectors to the ML model, records time-series snapshots, and updates
 * trust scores.
 * ==============================================================================
 */

const Application = require('../models/Application');
const MonitoringSnapshot = require('../models/MonitoringSnapshot');
const AccessLog = require('../models/AccessLog');
const { normalizeFeatures, riskFromScore } = require('../services/features');
const { getTrustPrediction } = require('../services/mlService');
const { refreshRiskOutputs } = require('../services/recommendationService');

/**
 * POST /api/monitoring/metrics
 * Evaluates anomalous behavior through the ML pipeline.
 */
async function submitMetrics(req, res, next) {
  try {
    const { appId, features, source = 'automatic' } = req.body;
    if (!appId || !features) {
      return res.status(400).json({ message: 'appId and features are required' });
    }
    if (!['automatic', 'manual'].includes(source)) {
      return res.status(400).json({ message: "source must be 'automatic' or 'manual'" });
    }

    const app = await Application.findByAnyId(appId);
    if (!app) {
      return res.status(404).json({ message: `Application '${appId}' not found` });
    }

    // Manual slider override takes precedence over automatic agent ticks
    if (app.monitoringMode === 'manual' && source === 'automatic') {
      return res.status(202).json({
        ignored: true,
        reason: 'Manual slider data has priority',
        appId: app.appId
      });
    }

    if (source === 'manual' && app.monitoringMode !== 'manual') {
      app.monitoringMode = 'manual';
    }

    // Normalize and clean feature vector
    const cleanFeatures = normalizeFeatures(features);

    // Call ML prediction service (Python microservice preferred; will be null if offline)
    const prediction = await getTrustPrediction(app.appId, cleanFeatures);

    if (prediction.trustScore === null) {
      return res.status(503).json({
        message: 'ML microservice is unavailable. Start ml/api.py on port 8000.',
        predictionSource: prediction.predictionSource,
        error: prediction.modelDetails?.error
      });
    }

    app.currentFeatures = cleanFeatures;
    app.trustScore = prediction.trustScore;
    app.riskLevel = prediction.riskLevel || riskFromScore(prediction.trustScore);
    app.lastEvaluatedAt = new Date();
    await app.save();

    // Persist snapshot to MongoDB for historical tracking
    const snapshot = await MonitoringSnapshot.create({
      appId: app.appId,
      features: cleanFeatures,
      trustScore: prediction.trustScore,
      riskLevel: app.riskLevel,
      source,
      predictionSource: prediction.predictionSource,
      modelDetails: prediction.modelDetails
    });

    // Derive actionable recommendations and alerts
    await refreshRiskOutputs(app, cleanFeatures, prediction.trustScore);

    return res.json({
      message: 'Metrics evaluated successfully',
      appId: app.appId,
      source,
      monitoringMode: app.monitoringMode,
      features: cleanFeatures,
      trustScore: prediction.trustScore,
      riskLevel: app.riskLevel,
      predictionSource: prediction.predictionSource,
      snapshotId: snapshot._id
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/apps/:appId/monitoring-mode
 * Switches app between automatic background monitoring and manual slider experimentation.
 */
async function setMonitoringMode(req, res, next) {
  try {
    const { mode } = req.body;
    if (!['automatic', 'manual'].includes(mode)) {
      return res.status(400).json({ message: "mode must be 'automatic' or 'manual'" });
    }
    const app = await Application.findByAnyId(req.params.appId);
    if (!app) return res.status(404).json({ message: 'Application not found' });

    app.monitoringMode = mode;
    await app.save();

    res.json({ appId: app.appId, monitoringMode: app.monitoringMode });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/apps/:appId/trust-history?limit=50
 * Retrieves chronological trust score trend data for charts.
 */
async function getTrustHistory(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const app = await Application.findByAnyId(req.params.appId);
    const queryIds = app ? [app.appId, ...(app.aliases || [])] : [req.params.appId];

    const history = await MonitoringSnapshot.find({ appId: { $in: queryIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(history.reverse());
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/access-logs & GET /api/apps/:appId/access-logs
 * Retrieves access event history.
 */
async function getRecentAccess(req, res, next) {
  try {
    let filter = {};
    if (req.params.appId) {
      const app = await Application.findByAnyId(req.params.appId);
      const queryIds = app ? [app.appId, ...(app.aliases || [])] : [req.params.appId];
      filter = { appId: { $in: queryIds } };
    }
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const logs = await AccessLog.find(filter).sort({ occurredAt: -1 }).limit(limit).lean();
    res.json(logs);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  submitMetrics,
  setMonitoringMode,
  getTrustHistory,
  getRecentAccess
};
