# Databricks notebook source
# Odyssey bronze ingestion: German Foreign Office travel advisories (all countries), stored raw.
# Terms (ADR-003): shown complete, current and attributed; never summarized by an LLM.
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
URL = "https://www.auswaertiges-amt.de/opendata/travelwarning"
MIN_EXPECTED_COUNTRIES = 150  # the list normally has about 200; far fewer means a broken or partial response

start = time.time()
status, body = http_get(URL)
if body is None:
    raise Exception("Advisory API unreachable after retries")

entries = {k: v for k, v in json.loads(body).get("response", {}).items() if isinstance(v, dict)}
if len(entries) < MIN_EXPECTED_COUNTRIES:
    raise Exception(f"Only {len(entries)} country entries (expected at least {MIN_EXPECTED_COUNTRIES}); not storing")

batch_id = str(uuid.uuid4())
now = datetime.now(timezone.utc)
spark.createDataFrame(
    [("travelwarning_list", "ALL", None, body, status, "travel_advisories", now, batch_id,
      hashlib.sha256(body.encode()).hexdigest())],
    "query_name STRING, country_iso3 STRING, country_qid STRING, response_json STRING, http_status INT, "
    "_source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING",
).write.mode("append").saveAsTable(f"{catalog}.bronze.advisories_raw")

spark.createDataFrame(
    [(now, "travel_advisories", batch_id, "ALL/travelwarning_list", len(entries),
      f"{catalog}.bronze.advisories_raw", int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT",
).write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")

flagged = sum(1 for v in entries.values() if v.get("warning") or v.get("partialWarning"))
print(f"BATCH {batch_id}: {len(entries)} countries stored, {flagged} with a full or partial travel warning")
