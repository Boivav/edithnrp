const mongoose = require('mongoose');

const permissionLogSchema = new mongoose.Schema({
  appId:          { type: String, required: true, index: true },
  appName:        { type: String },
  permission:     { type: String, required: true },
  previousStatus: { type: String, default: 'none' },
  newStatus:      { type: String, required: true, enum: ['approved', 'restricted', 'suspended', 'revoked'] },
  changedBy:      { type: String, default: 'user' },
  reason:         { type: String, default: '' },
  timestamp:      { type: Date, default: Date.now, index: true }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  collection: 'permissionlogs'
});

module.exports = mongoose.model('PermissionLog', permissionLogSchema, 'permissionlogs');

