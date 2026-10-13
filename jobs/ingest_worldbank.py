# Databricks notebook source
# Odyssey bronze ingestion: World Bank indicators for all pilot countries, stored raw.
import hashlib
import json
import time
import urllib.request
import uuid
from datetime import datetime, timezone

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")

UA = "OdysseyPlatform/0.1 (https://aakashmanandhar.tech/odyssey)"
INDICATORS = {
    "ST.INT.ARVL": "international tourist arrivals",
    "ST.INT.RCPT.CD": "international tourism receipts (current US$)",
    "SP.POP.TOTL": "population",
    "PA.NUS.PPP": "PPP conversion factor, GDP (LCU per international $)",
    "PA.NUS.FCRF": "official exchange rate (LCU per US$, period average)",
}
YEARS = "2000:2026"


def http_get(url, attempts=4):
    """GET with retries and backoff. Returns (status, body) or (None, None)."""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, resp.read().decode("utf-8")
        except Exception as e:
            print(f"    attempt {attempt} failed: {type(e).__name__}: {str(e)[:120]}")
            if attempt == attempts:
                return None, None
            time.sleep(20 * attempt)


iso3s = [r.iso3 for r in spark.table(f"{catalog}.silver.pilot_countries").select("iso3").collect()]
batch_id = str(uuid.uuid4())
rows, logs, failures = [], [], []

for code, label in INDICATORS.items():
    url = (f"https://api.worldbank.org/v2/country/{';'.join(iso3s)}/indicator/{code}"
           f"?format=json&per_page=2000&date={YEARS}")
    start = time.time()
    status, body = http_get(url)
    payload = json.loads(body) if body else None
    # A valid response is [metadata, [records...]]; an error is [{"message": ...}]
    if not payload or len(payload) < 2 or payload[1] is None:
        failures.append(code)
        print(f"{code:<16} FAILED: {str(payload)[:200]}")
        if body is None and not rows:
            print("World Bank API unreachable on the first request; stopping early")
            break
        continue
    if payload[0].get("pages", 1) > 1:
        raise Exception(f"{code}: response has {payload[0]['pages']} pages; raise per_page")
    n_values = sum(1 for r in payload[1] if r.get("value") is not None)
    rows.append((code, "ALL", None, body, status, "worldbank_indicators", datetime.now(timezone.utc),
                 batch_id, hashlib.sha256(body.encode()).hexdigest()))
    logs.append((datetime.now(timezone.utc), "worldbank_indicators", batch_id, code, n_values,
                 f"{catalog}.bronze.worldbank_raw", int((time.time() - start) * 1000)))
    print(f"{code:<16} {len(payload[1]):>4} records, {n_values:>4} with values  ({label})")
    time.sleep(1)

if rows:
    spark.createDataFrame(rows, "query_name STRING, country_iso3 STRING, country_qid STRING, response_json STRING, "
                                "http_status INT, _source STRING, _ingested_at TIMESTAMP, _batch_id STRING, "
                                "_payload_hash STRING").write.mode("append").saveAsTable(f"{catalog}.bronze.worldbank_raw")
    spark.createDataFrame(logs, "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, "
                                "row_count BIGINT, path STRING, duration_ms BIGINT").write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")

print(f"BATCH {batch_id}: {len(rows)} indicators stored, {len(failures)} failed")
if failures:
    raise Exception(f"World Bank indicators failed: {failures}")
