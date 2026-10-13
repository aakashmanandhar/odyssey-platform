# Databricks notebook source
# Odyssey bronze ingestion: passport-index visa matrix (MIT), pinned to the commit that last changed the file.
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
REPO, PATH = "ilyankou/passport-index-dataset", "passport-index-tidy-iso3.csv"

start = time.time()
status, body = http_get(f"https://api.github.com/repos/{REPO}/commits?path={PATH}&per_page=1",
                        accept="application/vnd.github+json")
commits = json.loads(body) if body else []
if not commits:
    raise Exception(f"Could not find the latest commit for {PATH}")
sha, published = commits[0]["sha"], commits[0]["commit"]["committer"]["date"]

status, csv_text = http_get(f"https://raw.githubusercontent.com/{REPO}/{sha}/{PATH}", accept="text/csv")
if csv_text is None:
    raise Exception("Visa CSV download failed")
lines = [l for l in csv_text.splitlines() if l.strip()]
if not lines[0].lower().startswith("passport") or len(lines) < 30000:
    raise Exception(f"Unexpected visa CSV: header={lines[0][:60]!r}, rows={len(lines) - 1}")

batch_id = str(uuid.uuid4())
now = datetime.now(timezone.utc)
spark.createDataFrame(
    [("visa_matrix_tidy_iso3", sha, published, csv_text, status, "visa_matrix", now, batch_id,
      hashlib.sha256(csv_text.encode()).hexdigest())],
    "query_name STRING, source_version STRING, source_published_at STRING, response_csv STRING, http_status INT, "
    "_source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING",
).write.mode("append").saveAsTable(f"{catalog}.bronze.visa_raw")

spark.createDataFrame(
    [(now, "visa_matrix", sha[:12], f"ALL/{PATH}", len(lines) - 1, f"{catalog}.bronze.visa_raw",
      int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT",
).write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")

print(f"HEADER: {lines[0]}")
print(f"BATCH {batch_id}: commit {sha[:12]} published {published}, {len(lines) - 1} passport-destination pairs")
