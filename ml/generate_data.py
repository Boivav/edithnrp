import numpy as np
import pandas as pd
from features import FEATURE_NAMES

rng = np.random.default_rng(42)

PERMS = ["location", "camera", "microphone", "contacts", "storage"]
SENS_W = np.array([0.8, 1.0, 1.0, 0.7, 0.5])

CATS = {
    "navigation": dict(rate=[40, 0, 0, 0, 2],  night=.05, bg=.30, deny=.02),
    "social":     dict(rate=[6, 10, 4, 8, 12], night=.15, bg=.25, deny=.05),
    "camera":     dict(rate=[2, 15, 0, 0, 10], night=.10, bg=.05, deny=.02),
    "game":       dict(rate=[0, 0, 0, 0, 5],   night=.30, bg=.10, deny=.02),
    "utility":    dict(rate=[0, 0, 0, 0, 8],   night=.05, bg=.05, deny=.02),
    "messaging":  dict(rate=[1, 5, 6, 15, 10], night=.20, bg=.35, deny=.04),
}
ANOMALIES = ["burst", "night_spy", "permission_creep", "denied_probing", "slow_drift"]
N_APPS, N_DAYS = 60, 60

# ---------- 1. Simulate raw behaviour (one row = one monitoring window) ----------
rows = []
for a in range(N_APPS):
    cat = rng.choice(list(CATS))
    p = CATS[cat]
    base = np.array(p["rate"], float) * rng.uniform(0.7, 1.3)
    anomaly = rng.choice(ANOMALIES) if rng.random() < 0.30 else None
    onset = int(rng.integers(20, 35))
    target = int(rng.integers(5))

    for d in range(N_DAYS):
        r = base * (1.2 if d % 7 >= 5 else 1.0) * rng.lognormal(0, 0.15)
        night, bg, deny = p["night"], p["bg"], p["deny"]
        is_anom = anomaly is not None and d >= onset

        if is_anom:
            k = d - onset + 1
            if anomaly == "burst":
                r[target] = max(r[target], 3) * rng.uniform(6, 15)
            elif anomaly == "night_spy":
                night, bg = 0.6, 0.7
                r[target] = max(r[target], 3) * 2
            elif anomaly == "permission_creep":
                r = np.where(base == 0, rng.uniform(3, 10, 5), r)
            elif anomaly == "denied_probing":
                deny = 0.5
                r = r * 1.5
            elif anomaly == "slow_drift":
                r[target] = max(r[target], 3) * (1 + 0.2 * k)

        counts = rng.poisson(r)
        n = int(counts.sum())
        rows.append(dict(
            app_id=a, category=cat, day=d, access_count=n,
            **{f"c_{q}": int(c) for q, c in zip(PERMS, counts)},
            night_n=int(rng.binomial(n, night)),
            bg_n=int(rng.binomial(n, bg)),
            denied_access_count=int(rng.binomial(n, deny)),
            sens_n=float((counts * SENS_W).sum()),
            is_anomalous=int(is_anom),
            scenario=anomaly if is_anom else "normal",
        ))

df = pd.DataFrame(rows).sort_values(["app_id", "day"]).reset_index(drop=True)

# ---------- 2. Features from history only ----------
g = df.groupby("app_id")
df["expected"] = g["access_count"].transform(lambda s: s.shift(1).rolling(7, min_periods=3).mean())
df["std14"] = g["access_count"].transform(lambda s: s.shift(1).rolling(14, min_periods=3).std())

df["frequency_ratio"] = df.access_count / df.expected.clip(lower=1)
df["baseline_deviation"] = (df.access_count - df.expected) / (df.std14.fillna(1) + 1)
df["night_access_ratio"] = df.night_n / df.access_count.clip(lower=1)
df["background_access_ratio"] = df.bg_n / df.access_count.clip(lower=1)
df["sensitive_access_ratio"] = df.sens_n / df.access_count.clip(lower=1)
df["unique_permissions"] = (df[[f"c_{q}" for q in PERMS]] > 0).sum(axis=1)

new = 0
for q in PERMS:
    prev = g[f"c_{q}"].transform(lambda s: s.shift(1).rolling(14, min_periods=1).sum())
    new = new + ((df[f"c_{q}"] > 0) & (prev.fillna(0) == 0)).astype(int)
df["new_permissions"] = new

df = df[(df.day >= 7) & df.expected.notna()].copy()

# ---------- 3. Synthetic trust score ----------
risk = (
    20 * np.clip(df.frequency_ratio / 6, 0, 1)
    + 15 * np.clip(df.baseline_deviation / 6, 0, 1)
    + 15 * np.clip(df.new_permissions / 2, 0, 1)
    + 15 * df.night_access_ratio
    + 15 * df.background_access_ratio
    + 10 * np.clip(df.denied_access_count / 10, 0, 1)
    + 10 * df.sensitive_access_ratio * np.clip(df.frequency_ratio / 3, 0, 1)
)
df["risk_score"] = np.clip(risk + rng.normal(0, 3, len(df)), 0, 100)
df["trust_score"] = 100 - df["risk_score"]

out = df[["app_id", "category", "day"] + FEATURE_NAMES + ["is_anomalous", "scenario", "trust_score"]]
out.to_csv("edith_synthetic.csv", index=False)
print("Saved edith_synthetic.csv", out.shape)
print(out.scenario.value_counts())