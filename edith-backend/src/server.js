const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config(); // Fallback for root execution
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const Application = require('./models/Application');
const { DEFAULT_FEATURES } = require('./services/features');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api', routes);
app.use((req, res) => res.status(404).json({ message: 'Endpoint not found' }));
app.use(errorHandler);

const SEED_APPS = [
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
    ],
    trustScore: 96.0,
    riskLevel: 'low'
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
      { name: 'Storage', status: 'approved', sensitive: false }
    ],
    trustScore: 94.0,
    riskLevel: 'low'
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
    ],
    trustScore: 97.0,
    riskLevel: 'low'
  }
];

async function seedIfEmpty() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const count = await Application.countDocuments();
    if (count === 0) {
      console.log('[Seed] Database is empty. Seeding initial applications...');
      for (const item of SEED_APPS) {
        await Application.create({
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
          trustScore: item.trustScore,
          riskLevel: item.riskLevel
        });
      }
      console.log('[Seed] Seeding completed successfully.');
    }
  } catch (err) {
    console.warn('[Seed Notice]', err.message);
  }
}

const PORT = process.env.PORT || 5000;
connectDB().then(async () => {
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`E.D.I.T.H. Backend API listening on http://localhost:${PORT}`);
    console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
    console.log(`Dashboard endpoint: http://localhost:${PORT}/api/dashboard`);
    console.log(`=======================================================`);
  });
}).catch(error => {
  console.error('Could not start server:', error.message);
});
