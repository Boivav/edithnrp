const mongoose = require('mongoose');

const monitoringSnapshotSchema = new mongoose.Schema({
  appId:            { type: String, required: true, index: true },
  features:         { type: mongoose.Schema.Types.Mixed, required: true },
  trustScore:       { type: Number, min: 0, max: 100, required: true },
  riskLevel:        { type: String, enum: ['low', 'medium', 'high'], required: true },
  source:           { type: String, enum: ['automatic', 'manual'], required: true },
  predictionSource: { type: String, default: 'ml' },
  modelDetails:     mongoose.Schema.Types.Mixed,
  timestamp:        { type: Date, default: Date.now, index: true }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  collection: 'monitoringsnapshots'
});

module.exports = mongoose.model('MonitoringSnapshot', monitoringSnapshotSchema, 'monitoringsnapshots');
