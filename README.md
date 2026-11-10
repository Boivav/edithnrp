# E.D.I.T.H.: Enhanced Digital Identity, Trust & Heuristics

Integrated Permission Management, Behavioral Telemetry, and Machine Learning Trust Scoring Platform.

## Architecture

- **Frontend (`src/`)**: React 18 + Vite + TypeScript. Interactive behavioral feature sliders, trust trend charts, permission governance, and live simulator.
- **Backend (`edith-backend/`)**: Node.js + Express + Mongoose. REST API connected to MongoDB Atlas, ingests 9-feature telemetry vectors, manages applications, alerts, and access logs.
- **ML Model (`ml/`)**: Gradient Boosting Regressor + Anomaly Detection engine. Evaluates 9-dimensional telemetry features into continuous trust scores (0..100) and risk categorizations.

## Prerequisites

- Node.js 18+
- Python 3.10+ (for standalone ML microservice)
- MongoDB Atlas connection string (configured in `edith-backend/.env`)

## Running the Complete System

### 1. Backend & Database
```bash
cd edith-backend
npm install
npm run seed     # Seeds apps and clears stale alerts in MongoDB Atlas
npm run dev      # Runs Express API on http://localhost:5000
```

### 2. Machine Learning Microservice (Optional / Standalone)
```bash
python ml/service.py --port 8000
```
*Note: If the Python microservice is not active, the backend automatically uses its integrated ML inference engine with the identical mathematical model.*

### 3. Frontend
From the root directory:
```bash
npm install
npm run dev      # http://localhost:5173
```

Or from the root directory using convenience scripts:
```bash
npm run backend:seed  # Seeds MongoDB Atlas
npm run backend       # Starts backend
npm run ml            # Starts ML service
npm run dev           # Starts Vite frontend
```

## Initial State & Behavioral Sliders
- All applications (**Lumen Notes**, **PixelShare**, **FitTrack**) start in a healthy state with high trust scores (>90%), low risk, and **zero initial alerts**.
- In each app's detail page (`#app-pixel`, `#app-lumen`, `#app-fit`), interactive sliders allow tuning the 9 ML telemetry features:
  - `access_count`
  - `frequency_ratio`
  - `baseline_deviation`
  - `unique_permissions`
  - `new_permissions`
  - `night_access_ratio`
  - `background_access_ratio`
  - `sensitive_access_ratio`
  - `denied_access_count`
- Sliders send real-time manual updates to `POST /api/monitoring/metrics`, immediately evaluating new trust scores via the ML model.
- Clicking **Reset Sliders** restores default baseline values and clears active manual alerts.
