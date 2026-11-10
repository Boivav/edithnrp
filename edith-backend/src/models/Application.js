const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { type: String, enum: ['approved', 'restricted', 'suspended', 'revoked'], default: 'approved' },
  sensitive: { type: Boolean, default: false }
}, { _id: false });

const featureSchema = new mongoose.Schema({
  access_count: { type: Number, default: 0 },
  frequency_ratio: { type: Number, default: 1 },
  baseline_deviation: { type: Number, default: 0 },
  unique_permissions: { type: Number, default: 0 },
  new_permissions: { type: Number, default: 0 },
  night_access_ratio: { type: Number, default: 0 },
  background_access_ratio: { type: Number, default: 0 },
  sensitive_access_ratio: { type: Number, default: 0 },
  denied_access_count: { type: Number, default: 0 }
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  appId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  icon: { type: String, default: '📱' },
  color: { type: String, default: '#2cc8ff' },
  aliases: [{ type: String }],
  expectedPermissions: [{ type: String }],
  permissions: [permissionSchema],
  monitoringMode: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
  baselineFeatures: { type: featureSchema, default: () => ({}) },
  currentFeatures: { type: featureSchema, default: () => ({}) },
  trustScore: { type: Number, min: 0, max: 100, default: 100 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  lastEvaluatedAt: Date
}, { timestamps: true });

/**
 * Helper to find an app by either primary appId or alias (e.g. 'lumen' or 'APP_A')
 */
applicationSchema.statics.findByAnyId = function (id) {
  if (!id) return Promise.resolve(null);
  const cleanId = String(id).trim();
  return this.findOne({
    $or: [
      { appId: cleanId },
      { appId: cleanId.toLowerCase() },
      { aliases: cleanId },
      { aliases: cleanId.toUpperCase() }
    ]
  });
};

module.exports = mongoose.model('Application', applicationSchema);
