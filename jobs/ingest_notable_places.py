# Databricks notebook source
# Odyssey bronze ingestion: notable places near each destination from Wikipedia's geosearch API, then their
# details (coordinates and type, free lead photo, Wikidata ID, 30-day page views, local-language title), then
# Commons imageinfo for the photos. Responses stored raw.
# Cities are searched on a 19-point grid of 3 km circles: one circle returns at most 500 articles, and a dense
# centre (Rome, Kyoto) fills that within about 1 km. Other destinations use one 10 km circle.
import hashlib
import json
import math
import time
import urllib.parse
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
META = "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|ImageDescription"
LOCAL = {"NPL": "ne", "JPN": "ja", "THA": "th", "ITA": "it", "DEU": "de", "CHE": "de", "ISL": "is",
         "MAR": "fr", "TZA": "sw", "PER": "es", "MEX": "es", "NZL": "mi"}

def grid(lat, lon):
    """Centre plus 6 points at 3 km and 12 points at 5.5 km."""
    points = [(lat, lon)]
    for ring_km, count, offset_deg in ((3.0, 6, 0), (5.5, 12, 15)):
        for k in range(count):
            a = math.radians(offset_deg + 360 * k / count)
            points.append((lat + ring_km * math.cos(a) / 111.32,
                           lon + ring_km * math.sin(a) / (111.32 * math.cos(math.radians(lat)))))
    return points

def api(base, params, tries=3):
    status, body = http_get(f"{base}?{urllib.parse.urlencode(params)}", attempts=tries, backoff_seconds=10)
    try:
        return status, body, (json.loads(body) if body else None)
    except ValueError:
        return status, body, None

dest = spark.table(f"{catalog}.silver.silver_destinations")
cols = dest.columns
lat_col = next((c for c in cols if c in ("lat", "latitude", "center_lat")), None)
lon_col = next((c for c in cols if c in ("lon", "lng", "longitude", "center_lon")), None)
if not lat_col or not lon_col:
    raise Exception(f"No coordinate columns in silver_destinations: {cols}")
rows = dest.select("destination_qid", "country_iso3", "kind", lat_col, lon_col).where(f"{lat_col} is not null").collect()

start, batch_id, now = time.time(), str(uuid.uuid4()), datetime.now(timezone.utc)
raw, page_country, files = [], {}, set()

def keep(name, iso3, qid, body, status):
    raw.append((name, iso3, qid, body, status, "notable_places", now, batch_id, hashlib.sha256(body.encode()).hexdigest()))

# 1) Geosearch hits (article IDs, distance and type per search circle)
points_total = points_failed = 0
for n, r in enumerate(rows, 1):
    if n % 25 == 0:
        print(f"  geosearch {n}/{len(rows)}: {len(page_country)} articles, {points_failed}/{points_total} circles failed", flush=True)
    lat, lon = float(r[lat_col]), float(r[lon_col])
    circles, radius = (grid(lat, lon), 3000) if r.kind == "city" else ([(lat, lon)], 10000)
    for plat, plon in circles:
        points_total += 1
        status, body, data = api(WIKI, {"action": "query", "format": "json", "formatversion": "2",
                                        "list": "geosearch", "gscoord": f"{plat:.6f}|{plon:.6f}",
                                        "gsradius": radius, "gslimit": 500, "gsprop": "type|dim"})
        if data is None:
            points_failed += 1
            continue
        keep("wikipedia_geosearch_list", r.country_iso3, r.destination_qid, body, status)
        for g in data.get("query", {}).get("geosearch", []):
            page_country.setdefault(g["pageid"], r.country_iso3)
        time.sleep(0.2)

print(f"geosearch done: {len(page_country)} articles from {points_total} circles, {points_failed} failed", flush=True)
if points_failed > 0.2 * points_total:
    raise Exception(f"{points_failed}/{points_total} geosearch circles failed; not storing")

# 2) Article details, 50 per request, grouped by country (one local language per request)
by_country = defaultdict(list)
for pid, iso in page_country.items():
    by_country[iso].append(pid)
detail_batches = detail_failed = 0
for iso, ids in by_country.items():
    ids.sort()
    for i in range(0, len(ids), 50):
        detail_batches += 1
        if detail_batches % 100 == 0:
            print(f"  details batch {detail_batches}: {len(files)} photos so far, {detail_failed} failed", flush=True)
        params = {"action": "query", "format": "json", "formatversion": "2",
                  "pageids": "|".join(str(p) for p in ids[i:i + 50]),
                  "prop": "coordinates|pageimages|pageprops|pageviews|langlinks",
                  "piprop": "name", "pilicense": "free", "pilimit": "max", "ppprop": "wikibase_item",
                  "pvipdays": 30, "colimit": "max", "coprop": "type|dim", "lllang": LOCAL.get(iso, "en"), "lllimit": "max"}
        cont, ok = {}, True
        for _ in range(10):
            status, body, data = api(WIKI, {**params, **cont})
            if data is None:
                ok = False
                break
            keep("wikipedia_pages", iso, None, body, status)
            files.update(p["pageimage"] for p in data.get("query", {}).get("pages", []) if p.get("pageimage"))
            if "continue" not in data:
                break
            cont = data["continue"]
            time.sleep(0.2)
        detail_failed += 0 if ok else 1
        time.sleep(0.2)

if detail_failed > 0.05 * max(detail_batches, 1):
    raise Exception(f"{detail_failed}/{detail_batches} detail batches failed; not storing")

# 3) Commons licence and URLs: up to 50 files per request, URL kept under ~7,000 characters
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
    if commons_batches % 100 == 0:
        print(f"  commons {done}/{len(files)}, {commons_failed} batches skipped", flush=True)
    status, body, data = api(COMMONS, {"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
                                       "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1600,
                                       "iiextmetadatafilter": META, "titles": "|".join("File:" + f for f in chunk)})
    done += len(chunk)
    if data is None:
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
    [(now, "notable_places", batch_id, "ALL/wikipedia_geosearch", len(page_country),
      f"{catalog}.bronze.notable_places_raw", int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT").write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")
print(f"BATCH {batch_id}: {len(rows)} destinations, {points_total} circles ({points_failed} failed), "
      f"{len(page_country)} articles, {detail_failed} detail batches failed, {len(files)} photos, "
      f"{commons_failed} Commons batches skipped, {len(raw)} raw responses")
