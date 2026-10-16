# Databricks notebook source
# Odyssey bronze ingestion: destination photos.
# 1) Wikidata: main image (P18) and Wikivoyage page banner (P948) for every destination.
# 2) Wikimedia Commons: author, licence and a 1600px URL for each file. Responses stored raw.
import hashlib
import json
import time
import urllib.parse
import uuid
from datetime import datetime, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
SPARQL = "https://query.wikidata.org/sparql"
COMMONS = "https://commons.wikimedia.org/w/api.php"
THUMB_WIDTH = 1600
META = "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|ImageDescription"
MIN_IMAGE_SHARE = 0.5  # fewer than half the destinations with a photo means a broken response

start = time.time()
qids = sorted({r.destination_qid for r in spark.table(f"{catalog}.silver.silver_destinations")
               .select("destination_qid").collect() if r.destination_qid})
batch_id, now = str(uuid.uuid4()), datetime.now(timezone.utc)
raw, files, with_image = [], set(), set()

def keep(name, body, status):
    raw.append((name, "ALL", None, body, status, "destination_images", now, batch_id,
                hashlib.sha256(body.encode()).hexdigest()))

# 1) Wikidata, 100 destinations per query
for i in range(0, len(qids), 100):
    values = " ".join("wd:" + q for q in qids[i:i + 100])
    query = f"""SELECT ?item ?image ?banner WHERE {{ VALUES ?item {{ {values} }}
      OPTIONAL {{ ?item wdt:P18 ?image }} OPTIONAL {{ ?item wdt:P948 ?banner }} }}"""
    status, body = http_get(f"{SPARQL}?format=json&query={urllib.parse.quote(query)}",
                            accept="application/sparql-results+json")
    if body is None:
        raise Exception(f"Wikidata query failed for batch starting at {i}")
    keep("wikidata_p18_p948", body, status)
    for b in json.loads(body)["results"]["bindings"]:
        for role in ("image", "banner"):
            if role in b:
                files.add(urllib.parse.unquote(b[role]["value"].rsplit("/", 1)[-1]))
                with_image.add(b["item"]["value"].rsplit("/", 1)[-1])
    time.sleep(1)

if len(with_image) < MIN_IMAGE_SHARE * len(qids):
    raise Exception(f"Only {len(with_image)}/{len(qids)} destinations have a photo; not storing")

# 2) Commons, 50 files per request (the API maximum for anonymous clients)
files = sorted(files)
for i in range(0, len(files), 50):
    params = {"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
              "iiprop": "url|size|mime|extmetadata", "iiurlwidth": THUMB_WIDTH, "iiextmetadatafilter": META,
              "titles": "|".join("File:" + f for f in files[i:i + 50])}
    status, body = http_get(f"{COMMONS}?{urllib.parse.urlencode(params)}")
    if body is None:
        raise Exception(f"Commons imageinfo failed for batch starting at {i}")
    keep("commons_imageinfo", body, status)
    time.sleep(1)

schema = ("query_name STRING, country_iso3 STRING, country_qid STRING, response_json STRING, http_status INT, "
          "_source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING")
spark.createDataFrame(raw, schema).write.mode("append").saveAsTable(f"{catalog}.bronze.images_raw")
spark.createDataFrame(
    [(now, "destination_images", batch_id, "ALL/destination_images", len(files),
      f"{catalog}.bronze.images_raw", int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT").write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")
print(f"BATCH {batch_id}: {len(qids)} destinations, {len(with_image)} with a photo, "
      f"{len(files)} files, {len(raw)} raw responses stored")
