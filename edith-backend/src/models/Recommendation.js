const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  appId:      { type: String, required: true, index: true },
  appName:    String,
  permission: String,
  action:     { type: String, enum: ['restrict', 'suspend', 'revoke', 'review'], default: 'review' },
  reason:     { type: String, required: true },
  applied:    { type: Boolean, default: false },
  timestamp:  { type: Date, default: Date.now, index: true }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  collection: 'recommendations'
});

module.exports = mongoose.model('Recommendation', recommendationSchema, 'recommendations');
