# Databricks notebook source
# Odyssey place matcher: trains on phone-derived weak labels using name/distance/category/domain features only
# (phones excluded to avoid label leakage), splits by destination, picks a precision-first threshold,
# logs to MLflow, registers in Unity Catalog, and scores all candidate pairs.

# COMMAND ----------
# MAGIC %pip install -q "mlflow>=2.14" scikit-learn

# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
from datetime import datetime, timezone

import mlflow
import numpy as np
from mlflow import MlflowClient
from mlflow.models import infer_signature
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import (average_precision_score, f1_score, precision_recall_curve,
                             precision_score, recall_score, roc_auc_score)

dbutils.widgets.text("catalog", "odyssey_dev")
dbutils.widgets.text("min_precision", "0.97")
catalog = dbutils.widgets.get("catalog")
min_precision = float(dbutils.widgets.get("min_precision"))

FEATURES = ["distance_m", "name_trigram_jaccard", "name_levenshtein_ratio", "name_contained", "name_length_diff",
            "same_domain", "both_domain", "same_category", "either_category_other",
            "n_candidates_overture", "n_candidates_foursquare", "name_rank_for_overture", "name_rank_for_foursquare"]
assert not any("phone" in f for f in FEATURES), "phone features must not be used (label leakage)"

df = spark.sql(f"""
    select f.*, o.destination_key
    from {catalog}.silver.er_pair_features f
    join {catalog}.silver.silver_places o on o.place_source_key = f.overture_key
    where f.weak_label is not null
""").toPandas()
for c in FEATURES:
    df[c] = df[c].astype(float)

# Split whole destinations: 60% train, 20% validation, 20% test
rng = np.random.default_rng(42)
dests = np.array(sorted(df["destination_key"].unique()))
rng.shuffle(dests)
n = len(dests)
split = {d: "train" for d in dests[: int(0.6 * n)]}
split.update({d: "valid" for d in dests[int(0.6 * n): int(0.8 * n)]})
split.update({d: "test" for d in dests[int(0.8 * n):]})
df["split"] = df["destination_key"].map(split)
train, valid, test = (df[df["split"] == s] for s in ("train", "valid", "test"))
print({s: len(x) for s, x in (("train", train), ("valid", valid), ("test", test))})

model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.1, max_leaf_nodes=63, random_state=42)
model.fit(train[FEATURES], train["weak_label"])

# Precision-first threshold chosen on validation
p_valid = model.predict_proba(valid[FEATURES])[:, 1]
prec, rec, thr = precision_recall_curve(valid["weak_label"], p_valid)
ok = np.where(prec[:-1] >= min_precision)[0]
threshold = float(thr[ok[np.argmax(rec[:-1][ok])]]) if len(ok) else 0.5

# Honest evaluation on unseen destinations
p_test = model.predict_proba(test[FEATURES])[:, 1]
y_test, yhat = test["weak_label"], (p_test >= threshold).astype(int)
hard = (test["weak_label"] == 1) & (test["name_trigram_jaccard"] < 0.5)
metrics = {
    "test_precision": precision_score(y_test, yhat),
    "test_recall": recall_score(y_test, yhat),
    "test_f1": f1_score(y_test, yhat),
    "test_pr_auc": average_precision_score(y_test, p_test),
    "test_roc_auc": roc_auc_score(y_test, p_test),
    "test_recall_hard_positives": float(yhat[hard.values].mean()) if hard.any() else float("nan"),
    "threshold": threshold,
}
sample = valid.sample(min(20000, len(valid)), random_state=42)
imp = permutation_importance(model, sample[FEATURES], sample["weak_label"], n_repeats=3, random_state=42, scoring="average_precision")
importance = dict(sorted(zip(FEATURES, imp.importances_mean.round(4)), key=lambda kv: -kv[1]))

# Log and register
mlflow.set_registry_uri("databricks-uc")
user = spark.sql("select current_user()").first()[0]
mlflow.set_experiment(f"/Users/{user}/odyssey-place-matcher")
model_name = f"{catalog}.ml.place_matcher"
with mlflow.start_run(run_name=f"place_matcher_{datetime.now(timezone.utc):%Y%m%d_%H%M}") as run:
    mlflow.log_params({"model": "HistGradientBoostingClassifier", "max_iter": 300, "learning_rate": 0.1,
                       "max_leaf_nodes": 63, "min_precision": min_precision, "split": "by destination 60/20/20",
                       "labels": "unique shared phone <=100m; negatives = other candidates of matched places"})
    mlflow.log_metrics(metrics)
    mlflow.log_dict({"features": FEATURES, "permutation_importance_pr_auc": importance}, "features.json")
    info = mlflow.sklearn.log_model(model, artifact_path="model", registered_model_name=model_name,
                                    signature=infer_signature(sample[FEATURES], model.predict_proba(sample[FEATURES])[:, 1]),
                                    input_example=sample[FEATURES].head(3))
version = info.registered_model_version
MlflowClient().set_registered_model_alias(model_name, "champion", version)

# Score every candidate pair, country by country
scored_at = datetime.now(timezone.utc)
spark.sql(f"drop table if exists {catalog}.ml.er_pair_scores")
for (country,) in spark.sql(f"select distinct country_iso3 from {catalog}.silver.er_pair_features").collect():
    pdf = spark.sql(f"select pair_key, overture_key, foursquare_key, country_iso3, {', '.join(FEATURES)} "
                    f"from {catalog}.silver.er_pair_features where country_iso3 = '{country}'").toPandas()
    for c in FEATURES:
        pdf[c] = pdf[c].astype(float)
    pdf["match_score"] = model.predict_proba(pdf[FEATURES])[:, 1]
    pdf["is_match"] = pdf["match_score"] >= threshold
    pdf["model_version"] = str(version)
    pdf["threshold"] = threshold
    pdf["scored_at"] = scored_at
    spark.createDataFrame(pdf[["pair_key", "overture_key", "foursquare_key", "country_iso3", "match_score",
                               "is_match", "model_version", "threshold", "scored_at"]]) \
         .write.mode("append").saveAsTable(f"{catalog}.ml.er_pair_scores")

print(f"MODEL {model_name} v{version} (alias champion), threshold {threshold:.3f}")
for k, v in metrics.items():
    print(f"  {k}: {v:.4f}")
print("  importance:", importance)
