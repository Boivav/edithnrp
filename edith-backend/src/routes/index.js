/**
 * ==============================================================================
 * E.D.I.T.H. - BACKEND API ROUTES
 * ==============================================================================
 * Central routing configuration exposing endpoints for:
 * 1. Health & Status
 * 2. Dashboard Analytics & Summaries
 * 3. Application State & Management
 * 4. Machine Learning Model Endpoints (Python ML service proxy)
 * 5. Access Auditing & Event Ingestion
 * 7. Permission Governance & Enforcement
 * 8. Alerts & Real-time Anomaly Notifications
 * 9. AI Recommendation Actions
 * ==============================================================================
 */

const router = require('express').Router();
const { getDashboard, getApps, getApp } = require('../controllers/appController');
const {
  submitMetrics,
  setMonitoringMode,
  getTrustHistory,
  getRecentAccess
} = require('../controllers/monitoringController');
const { recordAccess } = require('../controllers/accessController');
const { updatePermission } = require('../controllers/permissionController');
const { predictTrustScore, getModelInfo } = require('../controllers/mlController');
const Alert = require('../models/Alert');
const Recommendation = require('../models/Recommendation');
const PermissionLog = require('../models/PermissionLog');

// ------------------------------------------------------------------------------
// 1. HEALTH CHECK & SYSTEM STATUS
// ------------------------------------------------------------------------------
/**
 * GET /api/health
 * Verifies that the API server is alive and responding.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'edith-backend',
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});

// ------------------------------------------------------------------------------
// 2. DASHBOARD & APPLICATIONS
// ------------------------------------------------------------------------------
/**
 * GET /api/dashboard
 * Aggregated dashboard metrics: average trust score, active alerts, high risk count,
 * application cards, and recent access activity.
 */
router.get('/dashboard', getDashboard);

/**
 * GET /api/apps
 * Returns list of all registered applications, their current trust scores, and status.
 */
router.get('/apps', getApps);

/**
 * GET /api/apps/:appId
 * Detailed profile of a specific app (e.g. 'lumen', 'pixel', 'fit'), including
 * declared permissions, behavior features, recent access logs, and recommendations.
 */
router.get('/apps/:appId', getApp);

// ------------------------------------------------------------------------------
// 3. MONITORING & METRICS (ML INTEGRATION PIPELINE)
// ------------------------------------------------------------------------------
/**
 * POST /api/monitoring/metrics
 * Ingests a 9-feature anomaly vector for an app, forwards it to the ML model,
 * stores a historical snapshot in MongoDB, and triggers alert/recommendation refreshes.
 * Supports source: "automatic" (from background agent) or "manual" (from UI sliders).
 */
router.post('/monitoring/metrics', submitMetrics);

/**
 * PATCH /api/apps/:appId/monitoring-mode
 * Toggles monitoring mode between "automatic" and "manual".
 * Body: { "mode": "automatic" | "manual" }
 */
router.patch('/apps/:appId/monitoring-mode', setMonitoringMode);

/**
 * GET /api/apps/:appId/trust-history?limit=50
 * Historical trust score snapshots for time-series charts.
 */
router.get('/apps/:appId/trust-history', getTrustHistory);

// ------------------------------------------------------------------------------
// 4. MACHINE LEARNING MODEL ENDPOINTS
// ------------------------------------------------------------------------------
/**
 * POST /api/ml/predict
 * Proxies the feature vector to the Python ML microservice (port 8000).
 * Returns real model output: trust_score, risk_level, anomaly_detected, reasons.
 * Uses trained edith_model.joblib (Gradient Boosting Regressor + Isolation Forest).
 */
router.post('/ml/predict', predictTrustScore);

/**
 * GET /api/ml/info
 * Returns model specifications, feature weights, and contract documentation.
 */
router.get('/ml/info', getModelInfo);

// ------------------------------------------------------------------------------
// 5. ACCESS EVENTS & LOGGING
// ------------------------------------------------------------------------------
/**
 * POST /api/access-events
 * Records a single permission access attempt by an application.
 * Flags suspicious events (e.g. undeclared permissions, denied accesses) and creates alerts.
 */
router.post('/access-events', recordAccess);

/**
 * GET /api/access-logs?limit=50
 * Global access activity feed across all applications.
 */
router.get('/access-logs', getRecentAccess);

/**
 * GET /api/apps/:appId/access-logs?limit=50
 * Access log feed scoped to an individual application.
 */
router.get('/apps/:appId/access-logs', getRecentAccess);

// ------------------------------------------------------------------------------
// 6. PERMISSIONS GOVERNANCE
// ------------------------------------------------------------------------------
/**
 * PATCH /api/apps/:appId/permissions/:permission
 * Updates permission policy state.
 * Body: { "status": "approved" | "restricted" | "suspended" | "revoked" }
 */
router.patch('/apps/:appId/permissions/:permission', updatePermission);

/**
 * GET /api/apps/:appId/permission-logs?limit=100
 * Full history of permission state changes for a specific app, with timestamps.
 */
router.get('/apps/:appId/permission-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await PermissionLog.find({ appId: req.params.appId })
      .sort({ changedAt: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/permission-logs?appId=&limit=100
 * Global permission change history across all apps (filter by ?appId= optionally).
 */
router.get('/permission-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filter = req.query.appId ? { appId: req.query.appId } : {};
    const logs = await PermissionLog.find(filter)
      .sort({ changedAt: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------------------
// 7. ALERTS
// ------------------------------------------------------------------------------
/**
 * GET /api/alerts
 * Retrieves active/unresolved alerts (or all alerts if ?all=true).
 */
router.get('/alerts', async (req, res, next) => {
  try {
    const filter = req.query.all === 'true' ? {} : { resolved: false };
    const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json(alerts);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/alerts/:id/resolve
 * Marks a specific alert as resolved / dismissed.
 */
router.patch('/alerts/:id/resolve', async (req, res, next) => {
  try {
    const alert = await Alert.findByIdAndUpdate(req.params.id, { resolved: true }, { new: true });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    res.json(alert);
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------------------
// 8. RECOMMENDATIONS
// ------------------------------------------------------------------------------
/**
 * GET /api/recommendations
 * Retrieves AI-generated security recommendations (e.g. restrict/revoke permissions).
 */
router.get('/recommendations', async (req, res, next) => {
  try {
    const filter = req.query.appId ? { appId: req.query.appId } : {};
    if (req.query.all !== 'true') filter.applied = false;
    const recommendations = await Recommendation.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json(recommendations);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
