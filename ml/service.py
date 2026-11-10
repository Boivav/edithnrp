"""
==============================================================================
E.D.I.T.H. - STANDALONE PURE PYTHON ML MICROSERVICE
==============================================================================
A zero-dependency HTTP server implementing the E.D.I.T.H. ML inference API.
Can be executed directly via:
    python ml/service.py [--port 8000]

Supported Endpoints:
- GET  /health            : Health check
- POST /predict           : Evaluates 9-feature vector and returns trust score
- POST /api/ml/predict    : Alias for /predict to match backend contract
- GET  /step              : Advances step simulation
- POST /attack/<name>     : Triggers attack simulation
- POST /reset             : Resets simulation state
==============================================================================
"""

import sys
import json
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from inference import score_app
from features import FEATURE_NAMES


class MLRequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PATCH")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/health", "/api/health"):
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = {"status": "ok", "service": "edith-ml-service", "version": "1.0.0"}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
        elif self.path in ("/step", "/api/step"):
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            default_feats = {
                "access_count": 8,
                "frequency_ratio": 1.0,
                "baseline_deviation": 0.0,
                "unique_permissions": 2,
                "new_permissions": 0,
                "night_access_ratio": 0.0,
                "background_access_ratio": 0.1,
                "sensitive_access_ratio": 0.1,
                "denied_access_count": 0,
            }
            res = score_app(default_feats)
            self.wfile.write(json.dumps([{"app": "lumen", **res, "features": default_feats}]).encode("utf-8"))
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not Found"}).encode("utf-8"))

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if self.path in ("/predict", "/api/ml/predict"):
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
            response_data = {
                "app_id": payload.get("app_id", "unknown"),
                **result
            }

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode("utf-8"))
        elif self.path.startswith("/attack/"):
            app_name = self.path.split("/")[-1]
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "attack started", "app": app_name}).encode("utf-8"))
        elif self.path == "/reset":
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "reset"}).encode("utf-8"))
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def log_message(self, format, *args):
        sys.stderr.write(f"[ML Service] {args[0]} {args[1]} -> {args[2]}\n")


def run(port=8000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, MLRequestHandler)
    print(f"E.D.I.T.H. Machine Learning Service listening on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down ML Service.")
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="E.D.I.T.H. ML Inference Server")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    args = parser.parse_args()
    run(args.port)
