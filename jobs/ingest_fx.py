# Databricks notebook source
# Odyssey bronze ingestion: ECB euro reference rates, incremental (first run backfills from 2015).
import hashlib
import time
import uuid
from datetime import date, datetime, timedelta, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
dbutils.widgets.text("start_period", "")  # optional override, e.g. 2015-01-01 for a manual backfill
catalog = dbutils.widgets.get("catalog")
table = f"{catalog}.bronze.fx_raw"

if dbutils.widgets.get("start_period"):
    start_period, mode = dbutils.widgets.get("start_period"), "manual"
elif not spark.catalog.tableExists(table):
    start_period, mode = "2015-01-01", "backfill"
else:
    start_period, mode = (date.today() - timedelta(days=10)).isoformat(), "incremental"

url = ("https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A"
       f"?startPeriod={start_period}&format=csvdata&detail=dataonly")
start = time.time()
status, body = http_get(url, accept="text/csv")
if body is None:
    raise Exception("ECB API unreachable after retries")

lines = [l for l in body.splitlines() if l.strip()]
header, n_obs = lines[0], len(lines) - 1
if not header.startswith("KEY,") or n_obs == 0:
    raise Exception(f"Unexpected ECB response: header={header[:80]!r}, observations={n_obs}")

batch_id = str(uuid.uuid4())
now = datetime.now(timezone.utc)
spark.createDataFrame(
    [("exr_daily", start_period, "ALL", body, status, "ecb_fx", now, batch_id, hashlib.sha256(body.encode()).hexdigest())],
    "query_name STRING, start_period STRING, country_iso3 STRING, response_csv STRING, http_status INT, "
    "_source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING",
).write.mode("append").saveAsTable(table)

spark.createDataFrame(
    [(now, "ecb_fx", batch_id, f"{mode}:{start_period}", n_obs, table, int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT",
).write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")

print(f"HEADER: {header}")
print(f"BATCH {batch_id}: mode={mode}, start={start_period}, {n_obs} observations, {len(body):,} bytes")
