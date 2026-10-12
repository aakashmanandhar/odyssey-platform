# Databricks notebook source
# Odyssey connectivity probe: can serverless compute reach each external source?
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")

ENDPOINTS = {
    "wikidata": "https://query.wikidata.org/sparql?query=SELECT%20%3Fx%20WHERE%20%7B%20BIND(1%20AS%20%3Fx)%20%7D&format=json",
    "worldbank_indicators": "https://api.worldbank.org/v2/country/NPL/indicator/ST.INT.ARVL?format=json&per_page=1",
    "ecb_fx": "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=jsondata",
    "public_holidays": "https://date.nager.at/api/v3/PublicHolidays/2026/DE",
    "wikipedia_pageviews": "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Kathmandu/daily/20260901/20260902",
    "github_api": "https://api.github.com/",
}
HEADERS = {"User-Agent": "OdysseyPlatform/0.1 (https://aakashmanandhar.tech/odyssey)"}

rows = []
for source_id, url in ENDPOINTS.items():
    start = time.time()
    status, error = None, None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=20) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        status, error = e.code, str(e)[:200]
    except Exception as e:
        error = f"{type(e).__name__}: {str(e)[:200]}"
    rows.append((datetime.now(timezone.utc), source_id, url, status, status == 200,
                 status is not None, int((time.time() - start) * 1000), error))

df = spark.createDataFrame(rows, "probed_at TIMESTAMP, source_id STRING, url STRING, http_status INT, "
                                 "ok BOOLEAN, reachable BOOLEAN, latency_ms INT, error STRING")
df.write.mode("append").saveAsTable(f"{catalog}.ops.connectivity_probe")

for r in rows:
    print(f"{r[1]:<22} status={r[3]}  ok={r[4]}  reachable={r[5]}  {r[6]} ms  {r[7] or ''}")
print(f"SUMMARY: {sum(r[4] for r in rows)}/{len(rows)} OK, {sum(r[5] for r in rows)}/{len(rows)} reachable")
