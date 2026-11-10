/**
 * ==============================================================================
 * PERMISSION CONTROLLER
 * ==============================================================================
 * Enforces permission state modifications (approved, restricted, suspended, revoked).
 * Automatically updates active recommendations and logs policy changes.
 * ==============================================================================
 */

const Application = require('../models/Application');
const AccessLog = require('../models/AccessLog');
const Recommendation = require('../models/Recommendation');
const PermissionLog = require('../models/PermissionLog');

/**
 * PATCH /api/apps/:appId/permissions/:permission
 * Updates an application's permission status.
 */
async function updatePermission(req, res, next) {
  try {
    const { status } = req.body;
    if (!['approved', 'restricted', 'suspended', 'revoked'].includes(status)) {
      return res.status(400).json({
        message: "Invalid permission status. Must be 'approved', 'restricted', 'suspended', or 'revoked'."
      });
    }

    const app = await Application.findByAnyId(req.params.appId);
    if (!app) return res.status(404).json({ message: 'Application not found' });

    let permission = app.permissions.find(
      p => p.name.toLowerCase() === req.params.permission.toLowerCase()
    );

    let previousStatus = 'none';
    if (!permission) {
      // If permission is newly being granted or configured
      permission = {
        name: req.params.permission,
        status: status,
        sensitive: ['camera', 'microphone', 'location', 'contacts', 'sms'].includes(
          req.params.permission.toLowerCase()
        )
      };
      app.permissions.push(permission);
    } else {
      previousStatus = permission.status;
      permission.status = status;
    }

    await app.save();

    // Log policy change to AccessLog audit trail
    await AccessLog.create({
      appId: app.appId,
      appName: app.name,
      permission: permission.name,
      action: `permission_${status}`,
      resource: 'permission settings',
      purpose: `Status changed from ${previousStatus} to ${status}`,
      status: status === 'approved' ? 'allowed' : 'denied',
      suspicious: false,
      source: 'system'
    });

    // Write to dedicated PermissionLog collection (approve / revoke / restrict / suspend history)
    await PermissionLog.create({
      appId: app.appId,
      appName: app.name,
      permission: permission.name,
      previousStatus,
      newStatus: status,
      changedBy: 'user',
      reason: `User changed ${permission.name} from ${previousStatus} to ${status}`,
      timestamp: new Date()
    });

    // Mark matching pending recommendations as applied
    await Recommendation.updateMany(
      {
        appId: app.appId,
        permission: { $regex: new RegExp(`^${permission.name}$`, 'i') },
        applied: false
      },
      { applied: true }
    );

    res.json({
      message: 'Permission updated successfully',
      appId: app.appId,
      permission: permission.name,
      previousStatus,
      status
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { updatePermission };
