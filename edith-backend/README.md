# E.D.I.T.H. Backend

Node.js + Express + MongoDB backend for the E.D.I.T.H. permission-monitoring demo. The frontend owns the UI and slider controls; this API stores events, sends the nine-feature vector to your ML service, persists trust-score history, and exposes dashboard/log/alert/recommendation endpoints.

## 1. Run locally

Requirements: Node.js 18+ and MongoDB running locally or a MongoDB Atlas connection string.

```bash
npm install
cp .env.example .env
# Edit .env and set MONGODB_URI and ML_API_URL
npm run seed
npm run dev
```

API base URL: `http://localhost:5000/api`

## 2. ML service contract

The backend sends a POST request to `ML_API_URL` with:

```json
{
  "app_id": "APP_A",
  "features": [8, 1, 0, 2, 0, 0, 0.1, 0.1, 0],
  "feature_names": ["access_count", "frequency_ratio", "baseline_deviation", "unique_permissions", "new_permissions", "night_access_ratio", "background_access_ratio", "sensitive_access_ratio", "denied_access_count"],
  "data": {
    "access_count": 8,
    "frequency_ratio": 1,
    "baseline_deviation": 0,
    "unique_permissions": 2,
    "new_permissions": 0,
    "night_access_ratio": 0,
    "background_access_ratio": 0.1,
    "sensitive_access_ratio": 0.1,
    "denied_access_count": 0
  }
}
```

Your Python API should return a JSON response containing a percentage:

```json
{ "trust_score": 92.5 }
```

Also accepted: `trustScore`, `score`, or `prediction`. Score must be from 0 to 100. If your Python model expects a different payload shape, edit only `src/services/mlService.js`.

`ALLOW_DEMO_FALLBACK=true` enables a clearly-labelled heuristic score if the ML service is unavailable. This is for frontend development only; it is not an ML prediction. Set it to `false` when you want failures to be returned instead of a fallback score.

## 3. Manual slider priority (important)

- Send slider values to `POST /api/monitoring/metrics` with `source: "manual"`.
- The first manual update switches that app to `monitoringMode: "manual"`.
- While manual mode is active, automatic metric requests for that app are ignored with HTTP 202. They cannot overwrite the slider values.
- When the user clicks Reset, call `PATCH /api/apps/:appId/monitoring-mode` with `{ "mode": "automatic" }`.
- Applications are independent: APP_A can be manual while APP_B and APP_C remain automatic.

Example manual request:

```bash
curl -X POST http://localhost:5000/api/monitoring/metrics \
  -H "Content-Type: application/json" \
  -d '{"appId":"APP_B","source":"manual","features":{"access_count":39,"frequency_ratio":4.8,"baseline_deviation":3.8,"unique_permissions":6,"new_permissions":2,"night_access_ratio":0.7,"background_access_ratio":0.8,"sensitive_access_ratio":0.9,"denied_access_count":3}}'
```

Example automatic request is identical except `source` is `automatic`.

## 4. API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard` | Summary, apps, open alerts and recent access |
| GET | `/api/apps` | All application cards |
| GET | `/api/apps/:appId` | App details, permissions, recent access and recommendations |
| POST | `/api/monitoring/metrics` | Submit features, call ML, save trust score and refresh recommendations |
| PATCH | `/api/apps/:appId/monitoring-mode` | Switch app between automatic/manual mode |
| GET | `/api/apps/:appId/trust-history?limit=50` | Trust-score graph data |
| POST | `/api/access-events` | Record one permission access event |
| GET | `/api/access-logs?limit=50` | Recent access logs across apps |
| GET | `/api/apps/:appId/access-logs?limit=50` | Logs for one app |
| PATCH | `/api/apps/:appId/permissions/:permission` | Approve/restrict/suspend/revoke a permission |
| GET | `/api/alerts` | Open alerts; add `?all=true` for all |
| PATCH | `/api/alerts/:id/resolve` | Resolve an alert |
| GET | `/api/recommendations?appId=APP_B` | Pending recommendations |

### Record an access event

```json
{
  "appId": "APP_B",
  "permission": "Camera",
  "action": "read",
  "resource": "camera",
  "purpose": "Upload profile photo",
  "status": "allowed",
  "source": "automatic"
}
```

The API marks an event suspicious if the permission was never granted, is not currently approved, or the access was denied. It stores the event and creates an alert when suspicious.

### Change a permission

```http
PATCH /api/apps/APP_B/permissions/Camera
Content-Type: application/json
```

```json
{ "status": "restricted" }
```

Allowed statuses: `approved`, `restricted`, `suspended`, `revoked`.

## 5. Frontend integration examples

```js
const API = 'http://localhost:5000/api';

// Send the current slider values. Call this on slider change (debounce ~300ms).
async function sendManualFeatures(appId, features) {
  const response = await fetch(`${API}/monitoring/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, source: 'manual', features })
  });
  if (!response.ok) throw new Error((await response.json()).message);
  return response.json(); // trustScore, riskLevel, predictionSource
}

// Load the dashboard cards and summary.
async function loadDashboard() {
  const response = await fetch(`${API}/dashboard`);
  return response.json();
}

// Load graph points for an app.
async function loadTrustGraph(appId) {
  const response = await fetch(`${API}/apps/${appId}/trust-history?limit=50`);
  return response.json();
}

// Reset only this app to automatic monitoring.
async function resetMonitoring(appId) {
  const response = await fetch(`${API}/apps/${appId}/monitoring-mode`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'automatic' })
  });
  return response.json();
}
```

Use the response from `/monitoring/metrics` to update the trust-score UI immediately. For graphs, fetch `/trust-history`; for activity, fetch `/access-logs`; for recommendations and alerts, fetch their respective endpoints. Do not calculate the displayed trust score in the frontend.

## 6. Important demo notes

- `APP_A`, `APP_B`, `APP_C` are the seeded IDs. Change these in `scripts/seed.js` if your frontend uses different IDs.
- `frequency_ratio`, `baseline_deviation`, and all ratios must be non-negative. The three ratio fields must be between 0 and 1. Keep the scale consistent with the model's training data.
- This is a simulated permission-monitoring prototype. A normal website cannot inspect other installed applications on a user's device or enforce their OS-level permissions. Your three dummy apps must send their simulated access events to this backend. Permission changes here update the demo's database state; they do not change real device permissions.
- Add authentication and authorization before using this beyond a controlled demo. Restrict CORS to your deployed frontend origin in production.
