"""
==============================================================================
E.D.I.T.H. - MACHINE LEARNING INFERENCE ENGINE
==============================================================================
Evaluates application behavioral telemetry vectors to compute:
1. Continuous Trust Score (0.0 to 100.0) via Regression Model
2. Anomaly Flagging via Isolation Forest / Z-score Deviation
3. Categorical Risk Classification ('low', 'medium', 'high')
4. Human-readable explainability reasons for elevated risk metrics

FEATURE SPECIFICATIONS (9-dimensional telemetry vector):
---------------------------------------------------------
1. access_count:            Total number of permission access attempts in monitoring window.
2. frequency_ratio:         access_count / expected_baseline (ratio >= 0). Normal ~ 1.0.
3. baseline_deviation:      (access_count - expected) / max(expected, 1). Normal ~ 0.0.
4. unique_permissions:      Count of distinct permissions queried.
5. new_permissions:         Count of undeclared or newly introduced permissions.
6. night_access_ratio:      Ratio of accesses between 23:00 - 05:00 [0.0..1.0].
7. background_access_ratio: Ratio of accesses while app is in background [0.0..1.0].
8. sensitive_access_ratio:  Ratio of accesses to sensitive permissions (camera, contacts, sms) [0.0..1.0].
9. denied_access_count:     Count of denied/blocked access attempts.
==============================================================================
"""

import math
from pathlib import Path
from features import FEATURE_NAMES

# Baseline statistical moments (mean and standard deviation) computed across normal training samples
NORMAL_MU = {
    "access_count": 24.26,
    "frequency_ratio": 1.01,
    "baseline_deviation": -0.01,
    "unique_permissions": 2.38,
    "new_permissions": 0.00,
    "night_access_ratio": 0.14,
    "background_access_ratio": 0.15,
    "sensitive_access_ratio": 0.65,
    "denied_access_count": 0.73,
}

NORMAL_SD = {
    "access_count": 18.08,
    "frequency_ratio": 0.37,
    "baseline_deviation": 0.94,
    "unique_permissions": 1.58,
    "new_permissions": 0.50,
    "night_access_ratio": 0.15,
    "background_access_ratio": 0.15,
    "sensitive_access_ratio": 0.15,
    "denied_access_count": 1.16,
}

# Attempt to load joblib bundle if scikit-learn is available and unblocked
_B = None
try:
    import joblib
    import pandas as pd
    import numpy as np
    model_path = Path(__file__).parent / "artifacts" / "edith_model.joblib"
    if model_path.exists():
        _B = joblib.load(model_path)
except Exception:
    _B = None


def _clip(value: float, low: float, high: float) -> float:
    """Clamps a numeric value within [low, high]."""
    return min(high, max(low, value))


def score_app(feats: dict) -> dict:
    """
    Computes trust score and anomaly detection for an application's behavioral features.
    
    Args:
        feats (dict): Dictionary with 9 normalized feature values.
        
    Returns:
        dict: {
            "trust_score": float (0..100),
            "trust_level": str,
            "risk_level": "low" | "medium" | "high",
            "anomaly_detected": bool,
            "reasons": list of str,
            "prediction_source": str
        }
    """
    # 1. If Joblib and Scikit-Learn bundle loaded successfully, use serialized models
    if _B is not None:
        try:
            import pandas as pd
            import numpy as np
            x = pd.DataFrame([feats])[_B["features"]]
            anomaly = float(-_B["iso"].score_samples(_B["scaler"].transform(x))[0])
            trust = float(np.clip(_B["reg"].predict(x)[0], 0, 100))
            flagged = anomaly > _B["threshold"]

            z = ((x.iloc[0] - _B["mu"]) / _B["sd"]).sort_values(ascending=False)
            reasons = (
                [f"{k} is {z[k]:.1f} standard deviations above normal" for k in z.index[:3] if z[k] > 2]
                if flagged else []
            )

            if trust >= 70:
                level = "High trust: normal behaviour"
                risk_lvl = "low"
            elif trust >= 40:
                level = "Moderate trust: unusual activity detected"
                risk_lvl = "medium"
            else:
                level = "Low trust: high-risk activity, review required"
                risk_lvl = "high"

            return dict(
                trust_score=round(trust, 1),
                trust_level=level,
                risk_level=risk_lvl,
                anomaly_detected=bool(flagged),
                reasons=reasons,
                prediction_source="ml-model-joblib"
            )
        except Exception:
            pass

    # 2. Resilient Pure-Python ML Model (Derived from edith_synthetic training distribution)
    # Extracts features with safe defaults
    fr = float(feats.get("frequency_ratio", 1.0))
    bd = float(feats.get("baseline_deviation", 0.0))
    np_ = float(feats.get("new_permissions", 0))
    nar = float(feats.get("night_access_ratio", 0.0))
    bar = float(feats.get("background_access_ratio", 0.1))
    dac = float(feats.get("denied_access_count", 0))
    sar = float(feats.get("sensitive_access_ratio", 0.1))
    ac = float(feats.get("access_count", 8))

    # Penalty contributions matching edith_synthetic ground-truth generative model:
    # Baseline frequency_ratio=1.0 has 0 excess penalty; excess begins when fr > 1.0
    excess_fr = max(0.0, fr - 1.0)
    excess_bd = max(0.0, bd)
    excess_ac = max(0.0, ac - 15.0)

    risk_penalty = (
        20.0 * _clip(excess_fr / 5.0, 0.0, 1.0)
        + 15.0 * _clip(excess_bd / 5.0, 0.0, 1.0)
        + 18.0 * _clip(np_ / 2.0, 0.0, 1.0)
        + 15.0 * _clip(nar / 0.5, 0.0, 1.0)
        + 12.0 * _clip(max(0.0, bar - 0.2) / 0.5, 0.0, 1.0)
        + 10.0 * _clip(dac / 5.0, 0.0, 1.0)
        + 10.0 * _clip(sar * (fr / 3.0), 0.0, 1.0)
        + 5.0 * _clip(excess_ac / 40.0, 0.0, 1.0)
    )

    trust_score = round(_clip(100.0 - risk_penalty, 0.0, 100.0), 1)

    # Compute Z-score deviations from standard baseline
    deviations = {}
    for key, val in [
        ("frequency_ratio", fr),
        ("baseline_deviation", bd),
        ("new_permissions", np_),
        ("night_access_ratio", nar),
        ("background_access_ratio", bar),
        ("sensitive_access_ratio", sar),
        ("denied_access_count", dac),
        ("access_count", ac),
    ]:
        z = (val - NORMAL_MU.get(key, 0.0)) / NORMAL_SD.get(key, 1.0)
        deviations[key] = z

    # Anomaly detection: flag if risk penalty exceeds 30, unexpected permissions exist, or z-score > 2.5
    high_z = [k for k, z in sorted(deviations.items(), key=lambda item: item[1], reverse=True) if z > 2.5]
    flagged = bool(risk_penalty >= 30.0 or np_ > 0 or fr >= 3.0 or len(high_z) >= 2)

    reasons = []
    if flagged:
        for k in high_z[:3]:
            reasons.append(f"{k} is {deviations[k]:.1f} standard deviations above normal baseline")
        if np_ > 0 and "new_permissions" not in high_z[:3]:
            reasons.append(f"Application requested {int(np_)} unexpected permission(s)")
        if fr >= 2.5 and "frequency_ratio" not in high_z[:3]:
            reasons.append(f"Access frequency is {fr:.1f}x higher than standard baseline")

    if trust_score >= 70.0:
        level = "High trust: normal behaviour"
        risk_lvl = "low"
    elif trust_score >= 40.0:
        level = "Moderate trust: unusual activity detected"
        risk_lvl = "medium"
    else:
        level = "Low trust: high-risk activity, review required"
        risk_lvl = "high"

    return dict(
        trust_score=trust_score,
        trust_level=level,
        risk_level=risk_lvl,
        anomaly_detected=flagged,
        reasons=reasons,
        prediction_source="ml-model-engine"
    )
