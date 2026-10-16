# Databricks notebook source
# Odyssey bronze ingestion: notable places near each destination from Wikipedia's geosearch API
# (coordinates, free lead photo, Wikidata ID, 30-day page views, local-language title),
# then Commons imageinfo for the photos. Responses stored raw.
# Replaces a Wikidata SPARQL design that hit query timeouts and rate limits in dense cities.
import hashlib
import json
import time
import urllib.parse
import uuid
from datetime import datetime, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
META = "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|ImageDescription"
LOCAL = {"NPL": "ne", "JPN": "ja", "THA": "th", "ITA": "it", "DEU": "de", "CHE": "de", "ISL": "is",
         "MAR": "fr", "TZA": "sw", "PER": "es", "MEX": "es", "NZL": "mi"}
MAX_PAGES_PER_DESTINATION = 200   # nearest articles; ranking by page views happens in dbt

dest = spark.table(f"{catalog}.silver.silver_destinations")
cols = dest.columns
lat_col = next((c for c in cols if c in ("lat", "latitude", "center_lat")), None)
lon_col = next((c for c in cols if c in ("lon", "lng", "longitude", "center_lon")), None)
if not lat_col or not lon_col:
    raise Exception(f"No coordinate columns in silver_destinations: {cols}")
rows = dest.select("destination_qid", "country_iso3", "kind", lat_col, lon_col).where(f"{lat_col} is not null").collect()

start, batch_id, now = time.time(), str(uuid.uuid4()), datetime.now(timezone.utc)
raw, pages, files, failed = [], set(), set(), []

def keep(name, iso3, qid, body, status):
    raw.append((name, iso3, qid, body, status, "notable_places", now, batch_id, hashlib.sha256(body.encode()).hexdigest()))

# 1) Geosearch per destination; property results arrive in pages of 50, followed via `continue`
for n, r in enumerate(rows, 1):
    if n % 25 == 0:
        print(f"  geosearch {n}/{len(rows)}: {len(pages)} articles, {len(files)} photos, {len(failed)} failed", flush=True)
    params = {"action": "query", "format": "json", "formatversion": "2",
              "generator": "geosearch", "ggscoord": f"{r[lat_col]}|{r[lon_col]}",
              "ggsradius": 6000 if r.kind == "city" else 10000, "ggslimit": MAX_PAGES_PER_DESTINATION,
              "prop": "coordinates|pageimages|pageprops|pageviews|langlinks",
              "piprop": "name", "pilicense": "free", "pilimit": "max", "ppprop": "wikibase_item",
              "pvipdays": 30, "colimit": "max", "coprop": "type|dim", "lllang": LOCAL.get(r.country_iso3, "en"), "lllimit": "max"}
    cont, ok = {}, True
    for _ in range(20):
        status, body = http_get(f"{WIKI}?{urllib.parse.urlencode({**params, **cont})}", attempts=3, backoff_seconds=10)
        try:
            data = json.loads(body) if body else None
        except ValueError:
            data = None
        if data is None:
            ok = False
            break
        keep("wikipedia_geosearch", r.country_iso3, r.destination_qid, body, status)
        for p in data.get("query", {}).get("pages", []):
            pages.add(p["pageid"])
            if p.get("pageimage"):
                files.add(p["pageimage"])
        if "continue" not in data:
            break
        cont = data["continue"]
        time.sleep(0.2)
    if not ok:
        failed.append(r.destination_qid)
    time.sleep(0.3)

print(f"geosearch done: {len(pages)} articles, {len(files)} photos, {len(failed)} failed {failed[:5]}", flush=True)
if len(failed) > 0.2 * len(rows):
    raise Exception(f"{len(failed)}/{len(rows)} destinations failed; not storing")

# 2) Commons licence and URLs: up to 50 files per request, URL kept under ~7,000 characters
def batches(names, max_n=50, max_len=7000):
    batch, length = [], 0
    for f in names:
        size = len(urllib.parse.quote("File:" + f)) + 3
        if batch and (len(batch) == max_n or length + size > max_len):
            yield batch
            batch, length = [], 0
        batch.append(f)
        length += size
    if batch:
        yield batch

files = sorted(files)
commons_failed, commons_batches, done = 0, 0, 0
for chunk in batches(files):
    commons_batches += 1
    if commons_batches % 50 == 0:
        print(f"  commons {done}/{len(files)}, {commons_failed} batches skipped", flush=True)
    params = {"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
              "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1600, "iiextmetadatafilter": META,
              "titles": "|".join("File:" + f for f in chunk)}
    status, body = http_get(f"{COMMONS}?{urllib.parse.urlencode(params)}", attempts=3, backoff_seconds=10)
    done += len(chunk)
    if body is None:
        commons_failed += 1
        continue
    keep("commons_imageinfo", "ALL", None, body, status)
    time.sleep(0.3)

if commons_batches and commons_failed > 0.05 * commons_batches:
    raise Exception(f"{commons_failed}/{commons_batches} Commons batches failed; not storing")

schema = ("query_name STRING, country_iso3 STRING, destination_qid STRING, response_json STRING, http_status INT, "
          "_source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING")
spark.createDataFrame(raw, schema).write.mode("append").saveAsTable(f"{catalog}.bronze.notable_places_raw")
spark.createDataFrame(
    [(now, "notable_places", batch_id, "ALL/wikipedia_geosearch", len(pages),
      f"{catalog}.bronze.notable_places_raw", int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT").write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")
print(f"BATCH {batch_id}: {len(rows)} destinations, {len(failed)} failed, {len(pages)} articles, "
      f"{len(files)} photos, {len(raw)} raw responses, {commons_failed} Commons batches skipped")
