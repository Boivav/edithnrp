const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config(); // Fallback for root execution
const dns = require('dns');

// Ensure DNS servers are configured for MongoDB Atlas SRV resolution
try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore in environments where setting DNS is restricted
}

const mongoose = require('mongoose');
const Application = require('../src/models/Application');
const Alert = require('../src/models/Alert');
const Recommendation = require('../src/models/Recommendation');
const { DEFAULT_FEATURES } = require('../src/services/features');

const apps = [
  {
    appId: 'lumen',
    aliases: ['APP_A'],
    name: 'Lumen Notes',
    icon: '📝',
    color: '#2cc8ff',
    expectedPermissions: ['storage', 'calendar'],
    permissions: [
      { name: 'Storage', status: 'approved', sensitive: false },
      { name: 'Calendar', status: 'approved', sensitive: false }
    ]
  },
  {
    appId: 'pixel',
    aliases: ['APP_B'],
    name: 'PixelShare',
    icon: '📷',
    color: '#ffc233',
    expectedPermissions: ['camera', 'storage', 'location'],
    permissions: [
      { name: 'Camera', status: 'approved', sensitive: true },
      { name: 'Location', status: 'approved', sensitive: true },
      { name: 'Storage', status: 'approved', sensitive: false },
      { name: 'Contacts', status: 'approved', sensitive: true },
      { name: 'Microphone', status: 'approved', sensitive: true },
      { name: 'SMS', status: 'approved', sensitive: true }
    ]
  },
  {
    appId: 'fit',
    aliases: ['APP_C'],
    name: 'FitTrack',
    icon: '🏃',
    color: '#b88cff',
    expectedPermissions: ['location', 'calendar'],
    permissions: [
      { name: 'Location', status: 'approved', sensitive: true },
      { name: 'Calendar', status: 'approved', sensitive: false },
      { name: 'Health', status: 'approved', sensitive: true }
    ]
  }
];

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in .env');
  }
  console.log('[Seed] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);

  // Clear stale alerts and recommendations so the system starts clean with 0 high-risk alerts
  await Alert.deleteMany({});
  await Recommendation.deleteMany({});
  console.log('[Seed] Cleared stale alerts and recommendations.');

  for (const item of apps) {
    await Application.findOneAndUpdate(
      { $or: [{ appId: item.appId }, { aliases: item.appId }, { appId: item.aliases[0] }] },
      {
        $set: {
          appId: item.appId,
          aliases: item.aliases,
          name: item.name,
          icon: item.icon,
          color: item.color,
          expectedPermissions: item.expectedPermissions,
          permissions: item.permissions,
          baselineFeatures: DEFAULT_FEATURES,
          currentFeatures: DEFAULT_FEATURES,
          monitoringMode: 'automatic',
          trustScore: 95.0,
          riskLevel: 'low'
        }
      },
      { upsert: true, new: true }
    );
  }
  console.log('Seeded E.D.I.T.H. applications successfully: lumen (APP_A), pixel (APP_B), fit (APP_C)');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
