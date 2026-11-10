/**
 * ==============================================================================
 * E.D.I.T.H. - FRONTEND BACKEND & ML API CLIENT
 * ==============================================================================
 * Connects the React application to the Node.js Express backend and
 * Machine Learning inference endpoints.
 *
 * Implements fault-tolerant network requests with timeouts and graceful
 * offline fallbacks so the frontend never crashes or freezes when the
 * backend or ML service is loading.
 * ==============================================================================
 */

import { Features } from "./ml/features";

export const API_BASE = "http://localhost:5000/api";

/** Helper to wrap fetch with a timeout */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sends manual slider telemetry features to the backend ML pipeline.
 * Flags the app as monitoringMode: "manual" so manual testing overrides background ticks.
 *
 * Endpoint: POST /api/monitoring/metrics
 */
export async function sendManualFeatures(appId: string, features: Features) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/monitoring/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId,
        source: "manual",
        features
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.warn(`[API] Manual metrics update failed for ${appId}:`, err.message);
    return null;
  }
}

/**
 * Sends automatic background behavior telemetry to the ML pipeline.
 *
 * Endpoint: POST /api/monitoring/metrics
 */
export async function sendAutomaticMetrics(appId: string, features: Features) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/monitoring/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId,
        source: "automatic",
        features
      })
    });
    if (res.status === 202) {
      // Ignored because manual slider mode is currently active
      return { ignored: true };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return null;
  }
}

/**
 * Resets an app's monitoring mode back to automatic background monitoring.
 *
 * Endpoint: PATCH /api/apps/:appId/monitoring-mode
 */
export async function resetMonitoringMode(appId: string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/apps/${appId}/monitoring-mode`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "automatic" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.warn(`[API] Reset monitoring mode failed for ${appId}:`, err.message);
    return null;
  }
}

/**
 * Updates an application's permission state on the backend.
 *
 * Endpoint: PATCH /api/apps/:appId/permissions/:permission
 */
export async function updateBackendPermission(appId: string, permission: string, status: string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/apps/${appId}/permissions/${permission}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.warn(`[API] Permission update failed:`, err.message);
    return null;
  }
}

/**
 * Ingests a single permission access event into MongoDB.
 *
 * Endpoint: POST /api/access-events
 */
export async function recordAccessEvent(event: {
  appId: string;
  permission: string;
  action?: string;
  resource?: string;
  purpose?: string;
  status: "allowed" | "denied";
  source?: "automatic" | "manual";
}) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/access-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return null;
  }
}

/**
 * Retrieves aggregate system dashboard state from MongoDB.
 *
 * Endpoint: GET /api/dashboard
 */
export async function fetchDashboard() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/dashboard`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return null;
  }
}

/**
 * Retrieves list of applications from MongoDB.
 *
 * Endpoint: GET /api/apps
 */
export async function fetchApps() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/apps`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return null;
  }
}

/**
 * Retrieves full application profile and permissions from MongoDB.
 *
 * Endpoint: GET /api/apps/:appId
 */
export async function fetchAppDetail(appId: string) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/apps/${appId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return null;
  }
}

/**
 * Retrieves historical trust score snapshots for chart rendering.
 *
 * Endpoint: GET /api/apps/:appId/trust-history
 */
export async function fetchTrustHistory(appId: string, limit = 50) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/apps/${appId}/trust-history?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return null;
  }
}

/**
 * Resolves or dismisses an alert.
 *
 * Endpoint: PATCH /api/alerts/:id/resolve
 */
export async function resolveAlert(id: string | number) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/alerts/${id}/resolve`, {
      method: "PATCH"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return null;
  }
}

/**
 * Verifies backend connectivity.
 *
 * Endpoint: GET /api/health
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/health`, {}, 1500);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends slider feature values directly to the Python ML model via the backend proxy.
 * Returns the real model output: trust_score, risk_level, anomaly_detected, reasons.
 *
 * Endpoint: POST /api/ml/predict
 */
export async function predictWithML(appId: string, features: Features): Promise<{
  trust_score: number;
  risk_level: string;
  anomaly_detected: boolean;
  reasons: string[];
  trust_level: string;
  prediction_source: string;
} | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/ml/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, data: features })
    }, 5000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.warn(`[API] ML predict failed for ${appId}:`, err.message);
    return null;
  }
}

