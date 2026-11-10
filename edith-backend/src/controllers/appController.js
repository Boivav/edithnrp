/**
 * ==============================================================================
 * APPLICATION CONTROLLER
 * ==============================================================================
 * Exposes endpoints for querying high-level system dashboard metrics and
 * application details.
 * ==============================================================================
 */

const Application = require('../models/Application');
const AccessLog = require('../models/AccessLog');
const Recommendation = require('../models/Recommendation');
const Alert = require('../models/Alert');

/**
 * GET /api/apps
 * Returns all monitored applications sorted by name.
 */
async function getApps(req, res, next) {
  try {
    const apps = await Application.find().sort({ name: 1 }).lean();
    res.json(apps);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/apps/:appId
 * Retrieves an individual application's profile, including permissions,
 * recent access logs, and pending security recommendations.
 */
async function getApp(req, res, next) {
  try {
    const app = await Application.findByAnyId(req.params.appId);
    if (!app) return res.status(404).json({ message: 'Application not found' });

    const queryIds = [app.appId, ...(app.aliases || [])];
    const [logs, recommendations] = await Promise.all([
      AccessLog.find({ appId: { $in: queryIds } }).sort({ occurredAt: -1 }).limit(30).lean(),
      Recommendation.find({ appId: { $in: queryIds }, applied: false }).sort({ createdAt: -1 }).lean()
    ]);

    res.json({
      ...app.toObject(),
      recentAccess: logs,
      recommendations
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard
 * Aggregates summary statistics, open alerts, and active apps for the main dashboard view.
 */
async function getDashboard(req, res, next) {
  try {
    const [apps, openAlerts, recentAccess, totalAllowed] = await Promise.all([
      Application.find().lean(),
      Alert.find({ resolved: false }).sort({ createdAt: -1 }).limit(20).lean(),
      AccessLog.find().sort({ occurredAt: -1 }).limit(30).lean(),
      AccessLog.countDocuments({ status: 'allowed' })
    ]);

    const averageTrustScore = apps.length
      ? Math.round(apps.reduce((sum, app) => sum + (app.trustScore ?? 0), 0) / apps.length)
      : 0;

    res.json({
      summary: {
        averageTrustScore,
        openAlerts: openAlerts.length,
        highRiskApps: apps.filter(app => app.riskLevel === 'high' || (app.trustScore ?? 100) < 50).length,
        allowedAccesses: totalAllowed
      },
      applications: apps,
      alerts: openAlerts,
      recentAccess
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getApps, getApp, getDashboard };
