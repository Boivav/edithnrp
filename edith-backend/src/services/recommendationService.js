const Recommendation = require('../models/Recommendation');
const Alert = require('../models/Alert');

// Recommendations are derived from the returned trust score and the same feature
// snapshot sent to ML. Permission names are matched to the app's granted permissions.
async function refreshRiskOutputs(app, features, trustScore) {
  await Recommendation.deleteMany({ appId: app.appId, applied: false });
  const recommendations = [];
  const add = (permission, action, reason) => recommendations.push({
    appId: app.appId, appName: app.name, permission, action, reason
  });

  if (trustScore < 70) {
    const candidates = app.permissions.filter(p => p.status === 'approved');
    if (features.sensitive_access_ratio >= 0.5 || features.new_permissions > 0) {
      const sensitive = candidates.filter(p => p.sensitive);
      (sensitive.length ? sensitive : candidates).forEach(p => add(p.name, 'restrict',
        'The ML trust score is below the safe threshold and sensitive/new permission activity is elevated.'));
    } else if (candidates.length) {
      add(candidates[0].name, 'review', 'The ML trust score has dropped below 70. Review whether this permission is still necessary.');
    }
  }
  if (trustScore < 40) {
    app.permissions.filter(p => p.status === 'approved' && p.sensitive).forEach(p =>
      add(p.name, 'suspend', 'High-risk ML score: temporarily suspend this sensitive permission pending review.'));
  }
  if (features.denied_access_count > 0) {
    add('Multiple permissions', 'review', `${features.denied_access_count} denied access attempt(s) were observed. Investigate the access pattern.`);
  }

  if (recommendations.length) await Recommendation.insertMany(recommendations);

  // Avoid creating the same unresolved alert on every polling tick.
  if (trustScore < 40) {
    const exists = await Alert.findOne({ appId: app.appId, resolved: false, title: 'Application trust score is critically low' });
    if (!exists) await Alert.create({ appId: app.appId, appName: app.name, severity: 'high', title: 'Application trust score is critically low', message: `ML trust score is ${trustScore}%. Review or suspend sensitive permissions.` });
  } else if (trustScore < 70) {
    const exists = await Alert.findOne({ appId: app.appId, resolved: false, title: 'Application behaviour needs review' });
    if (!exists) await Alert.create({ appId: app.appId, appName: app.name, severity: 'medium', title: 'Application behaviour needs review', message: `ML trust score is ${trustScore}%. Check recent access behaviour and recommendations.` });
  }
}

module.exports = { refreshRiskOutputs };
