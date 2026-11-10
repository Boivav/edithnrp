const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  appId:    { type: String, required: true, index: true },
  appName:  String,
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  feature:  String,
  resolved: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  collection: 'alerts'   // explicit collection name
});

module.exports = mongoose.model('Alert', alertSchema, 'alerts');
