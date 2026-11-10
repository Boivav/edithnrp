import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, GradientBoostingRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, classification_report, mean_absolute_error
from features import FEATURE_NAMES

df = pd.read_csv("edith_synthetic.csv")

print("Anomalous share:", round(df.is_anomalous.mean(), 3))
print(df.groupby("is_anomalous")[FEATURE_NAMES].mean().T.round(2), "\n")

# Split by app to avoid leakage between rows of the same app
train_idx, test_idx = next(
    GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42).split(df, groups=df.app_id)
)
train, test = df.iloc[train_idx].copy(), df.iloc[test_idx].copy()

# Anomaly detector: trained on NORMAL rows only
normal = train[train.is_anomalous == 0]
scaler = StandardScaler().fit(normal[FEATURE_NAMES])

iso = IsolationForest(n_estimators=100, random_state=42)   # 100 trees = faster live scoring
iso.fit(scaler.transform(normal[FEATURE_NAMES]))

normal_scores = -iso.score_samples(scaler.transform(normal[FEATURE_NAMES]))
threshold = float(np.percentile(normal_scores, 99))

# Evaluate
test["anomaly_score"] = -iso.score_samples(scaler.transform(test[FEATURE_NAMES]))
test["flag"] = (test.anomaly_score > threshold).astype(int)

print("ROC-AUC:", round(roc_auc_score(test.is_anomalous, test.anomaly_score), 3))
print(classification_report(test.is_anomalous, test.flag, target_names=["normal", "anomalous"]))
print("Detection rate per scenario:")
print(test.groupby("scenario").flag.mean().round(2), "\n")

# Trust score model
reg = GradientBoostingRegressor(n_estimators=200, max_depth=3, random_state=42)
reg.fit(train[FEATURE_NAMES], train.trust_score)
print("Trust score MAE:", round(mean_absolute_error(test.trust_score, reg.predict(test[FEATURE_NAMES])), 2))

# Save
mu = normal[FEATURE_NAMES].mean()
sd = normal[FEATURE_NAMES].std() + 1e-9
joblib.dump(
    dict(scaler=scaler, iso=iso, reg=reg, threshold=threshold, mu=mu, sd=sd, features=FEATURE_NAMES),
    "artifacts/edith_model.joblib",
)
print("Saved artifacts/edith_model.joblib")