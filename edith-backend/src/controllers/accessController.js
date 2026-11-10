/**
 * ==============================================================================
 * ACCESS CONTROLLER
 * ==============================================================================
 * Handles ingestion of runtime permission access events, security auditing,
 * and automatic alert generation for suspicious behavior.
 * ==============================================================================
 */

const Application = require('../models/Application');
const AccessLog = require('../models/AccessLog');
const Alert = require('../models/Alert');

/**
 * POST /api/access-events
 * Records a single permission access invocation.
 */
async function recordAccess(req, res, next) {
  try {
    const {
      appId,
      permission,
      action = 'access',
      resource,
      purpose,
      status = 'allowed',
      source = 'automatic',
      occurredAt
    } = req.body;

    if (!appId || !permission) {
      return res.status(400).json({ message: 'appId and permission are required' });
    }
    if (!['allowed', 'denied'].includes(status)) {
      return res.status(400).json({ message: "status must be 'allowed' or 'denied'" });
    }

    const app = await Application.findByAnyId(appId);
    if (!app) return res.status(404).json({ message: `Application '${appId}' not found` });

    const grantedPermission = app.permissions.find(
      p => p.name.toLowerCase() === permission.toLowerCase()
    );

    const isExpected = app.expectedPermissions?.length
      ? app.expectedPermissions.some(p => p.toLowerCase() === permission.toLowerCase())
      : !!grantedPermission;

    const suspicious = !grantedPermission || grantedPermission.status !== 'approved' || status === 'denied' || !isExpected;

    const reason = !grantedPermission
      ? 'Permission was not granted to this application.'
      : !isExpected
      ? 'Permission requested is outside declared expected behavior.'
      : grantedPermission.status !== 'approved'
      ? `Permission is currently ${grantedPermission.status}.`
      : status === 'denied'
      ? 'Access was denied by policy.'
      : undefined;

    const log = await AccessLog.create({
      appId: app.appId,
      appName: app.name,
      permission,
      action,
      resource: resource || permission,
      purpose: purpose || `Access to ${permission}`,
      status,
      suspicious,
      reason,
      source,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date()
    });

    if (suspicious) {
      await Alert.create({
        appId: app.appId,
        appName: app.name,
        severity: status === 'denied' ? 'high' : 'medium',
        title: 'Suspicious permission access',
        message: `${app.name} attempted ${permission}. ${reason || ''}`.trim(),
        feature: permission
      });
    }

    res.status(201).json({ message: 'Access event recorded', log });
  } catch (error) {
    next(error);
  }
}

module.exports = { recordAccess };
