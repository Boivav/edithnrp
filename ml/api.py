"""
==============================================================================
E.D.I.T.H. - FASTAPI MACHINE LEARNING SERVICE
==============================================================================
Provides REST endpoints and WebSocket feeds for application behavior anomaly
detection and real-time trust scoring.

ENDPOINTS:
- GET  /health            : Service health check
- POST /predict           : Evaluates 9-feature telemetry vector and returns trust score
- POST /api/ml/predict    : Alias for /predict to match backend routing contract
- POST /attack/{name}     : Trigger synthetic anomaly track for demo
- POST /reset             : Reset demo track cursor
- GET  /step              : Advance one monitoring window across demo apps
- WS   /ws/stream         : Continuous 1Hz streaming simulation
==============================================================================
"""

import asyncio
import csv
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from inference import score_app
from features import FEATURE_NAMES

app = FastAPI(
    title="E.D.I.T.H. Machine Learning Service",
    description="Permission trust scoring & anomaly detection engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Load synthetic tracking dataset
csv_path = Path(__file__).parent / "edith_synthetic.csv"
rows = []
if csv_path.exists():
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

def get_first_app(scenario_name: str) -> int:
    for r in rows:
        if r.get("scenario") == scenario_name:
            return int(r["app_id"])
    return 0

# App demo mapping
DEMO = {
    "Application A": 0,
    "Application B": get_first_app("burst"),
    "Application C": get_first_app("permission_creep"),
}

tracks: Dict[str, List[dict]] = {}
for name, aid in DEMO.items():
    matching = [r for r in rows if int(r.get("app_id", -1)) == aid]
    matching.sort(key=lambda x: int(x.get("day", 0)))
    tracks[name] = matching

onset: Dict[str, Optional[int]] = {}
for name, t in tracks.items():
    idx = None
    for i, r in enumerate(t):
        if r.get("is_anomalous") == "1":
            idx = i
            break
    onset[name] = idx

cursor = {n: 0 for n in DEMO}
armed = {n: False for n in DEMO}


def next_row(name: str) -> dict:
    t = tracks.get(name, [])
    if not t:
        return {}
    i = cursor[name]
    # Hold at normal baseline until attack is triggered
    if onset.get(name) is not None and i >= onset[name] and not armed.get(name, False):
        i = max(0, onset[name] - 1)
    else:
        cursor[name] = (i + 1) % len(t)
    return t[i]


@app.get("/health")
def health():
    """Health check endpoint to verify ML service availability."""
    return {"status": "ok", "service": "edith-ml-api", "version": "1.0.0"}


@app.post("/predict")
async def predict(payload: dict):
    """
    Evaluates trust score and risk anomalies for a 9-feature telemetry vector.
    
    Accepts:
    {
      "app_id": "lumen",
      "features": [8, 1.0, 0.0, 2, 0, 0.0, 0.1, 0.1, 0],
      "feature_names": [...],
      "data": { "access_count": 8, "frequency_ratio": 1.0, ... }
    }
    
    Returns:
    {
      "trust_score": 95.0,
      "trust_level": "High trust: normal behaviour",
      "risk_level": "low",
      "anomaly_detected": false,
      "reasons": []
    }
    """
    feats = {}
    if "data" in payload and isinstance(payload["data"], dict):
        feats = payload["data"]
    elif "features" in payload and isinstance(payload["features"], dict):
        feats = payload["features"]
    elif "features" in payload and isinstance(payload["features"], list):
        names = payload.get("feature_names", FEATURE_NAMES)
        for i, val in enumerate(payload["features"]):
            if i < len(names):
                feats[names[i]] = val
    else:
        feats = payload

    result = score_app(feats)
    return {
        "app_id": payload.get("app_id", "unknown"),
        **result
    }


@app.post("/api/ml/predict")
async def api_ml_predict(payload: dict):
    """Alias for /predict to match edith-backend ML service endpoint contract."""
    return await predict(payload)


@app.post("/attack/{name}")
def attack(name: str):
    """Triggers synthetic attack behavior for the specified demo app."""
    armed[name] = True
    if onset.get(name) is not None:
        cursor[name] = onset[name]
    return {"status": "attack started", "app": name}


@app.post("/reset")
def reset():
    """Resets all demo track cursors to initial baseline."""
    for n in DEMO:
        cursor[n] = 0
        armed[n] = False
    return {"status": "reset"}


def build_payload():
    payload = []
    for name in DEMO:
        row = next_row(name)
        if not row:
            continue
        feats = {k: float(row.get(k, 0)) for k in FEATURE_NAMES}
        res = score_app(feats)
        payload.append({
            "app": name,
            "tick": int(row.get("day", 0)),
            **res,
            "features": feats
        })
    return payload


@app.get("/step")
def step():
    """Advance one monitoring window and return all demo apps' scores."""
    return build_payload()


@app.websocket("/ws/stream")
async def stream(ws: WebSocket):
    """Streams live behavior evaluations at 1Hz over WebSocket."""
    await ws.accept()
    try:
        while True:
            payload = build_payload()
            await ws.send_json(payload)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
