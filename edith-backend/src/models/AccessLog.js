const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
  appId:      { type: String, required: true, index: true },
  appName:    String,
  permission: { type: String, required: true },
  action:     { type: String, default: 'access' },
  resource:   String,
  purpose:    String,
  status:     { type: String, enum: ['allowed', 'denied'], default: 'allowed' },
  suspicious: { type: Boolean, default: false },
  reason:     String,
  source:     { type: String, enum: ['automatic', 'manual', 'system'], default: 'automatic' },
  timestamp:  { type: Date, default: Date.now, index: true },
  occurredAt: { type: Date, default: Date.now }   // kept for backward compat
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  collection: 'accesslogs'
});

module.exports = mongoose.model('AccessLog', accessLogSchema, 'accesslogs');
