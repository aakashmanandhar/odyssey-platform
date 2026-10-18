# Databricks notebook source
# Odyssey bronze ingestion: Wikidata types for notable places (powers sight classification, ADR-020).
# 1) For every Wikidata item behind a notable place: instance-of (P31) and country (P17), 200 items per query.
# 2) For every distinct type: its full superclass chain (P279*), 25 types per query.
# Responses are stored raw; the classification policy lives in dbt (seed wikidata_class_rules).
import hashlib
import json
import math
import time
import urllib.parse
import uuid
from datetime import datetime, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
SPARQL = "https://query.wikidata.org/sparql"
ITEMS_PER_QUERY, TYPES_PER_QUERY = 200, 25
MIN_TYPED_SHARE = 0.6            # fewer typed items than this means a broken response: store nothing
MAX_FAILED_TYPE_SHARE = 0.05     # a few failed superclass batches are tolerated, more are not

start = time.time()
qids = sorted({r.wikidata_id for r in spark.table(f"{catalog}.silver.silver_notable_places")
               .select("wikidata_id").distinct().collect()
               if r.wikidata_id and r.wikidata_id.startswith("Q")})
batch_id, now = str(uuid.uuid4()), datetime.now(timezone.utc)
raw, types, typed = [], set(), set()

def keep(name, body, status):
    raw.append((name, "ALL", None, body, status, "wikidata_types", now, batch_id,
                hashlib.sha256(body.encode()).hexdigest()))

def sparql(query):
    return http_get(f"{SPARQL}?format=json&query={urllib.parse.quote(query)}",
                    accept="application/sparql-results+json", timeout=90)

# 1) instance-of and country for every item
for i in range(0, len(qids), ITEMS_PER_QUERY):
    values = " ".join("wd:" + q for q in qids[i:i + ITEMS_PER_QUERY])
    status, body = sparql(f"""SELECT ?item ?type ?country WHERE {{ VALUES ?item {{ {values} }}
      OPTIONAL {{ ?item wdt:P31 ?type }} OPTIONAL {{ ?item wdt:P17 ?country }} }}""")
    if body is None:
        raise Exception(f"Wikidata item query failed for batch starting at {i}")
    keep("wikidata_item_types", body, status)
    for b in json.loads(body)["results"]["bindings"]:
        if "type" in b:
            types.add(b["type"]["value"].rsplit("/", 1)[-1])
            typed.add(b["item"]["value"].rsplit("/", 1)[-1])
    time.sleep(1)

if len(typed) < MIN_TYPED_SHARE * len(qids):
    raise Exception(f"Only {len(typed)}/{len(qids)} items have a type; not storing")

# 2) superclass chain for every distinct type (P279* includes the type itself)
types = sorted(t for t in types if t.startswith("Q"))
batches = math.ceil(len(types) / TYPES_PER_QUERY)
failed = 0
for i in range(0, len(types), TYPES_PER_QUERY):
    values = " ".join("wd:" + t for t in types[i:i + TYPES_PER_QUERY])
    status, body = sparql(f"SELECT ?type ?ancestor WHERE {{ VALUES ?type {{ {values} }} ?type wdt:P279* ?ancestor }}")
    if body is None:
        failed += 1
        print(f"  superclass batch starting at {i} failed; continuing")
        continue
    keep("wikidata_type_ancestors", body, status)
    time.sleep(1)
if failed > MAX_FAILED_TYPE_SHARE * batches:
    raise Exception(f"{failed}/{batches} superclass batches failed; not storing")

schema = ("query_name STRING, country_iso3 STRING, country_qid STRING, response_json STRING, http_status INT, "
          "_source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING")
spark.createDataFrame(raw, schema).write.mode("append").saveAsTable(f"{catalog}.bronze.wikidata_types_raw")
spark.createDataFrame(
    [(now, "wikidata_types", batch_id, "ALL/wikidata_types", len(qids),
      f"{catalog}.bronze.wikidata_types_raw", int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT").write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")
print(f"BATCH {batch_id}: {len(qids)} items, {len(typed)} typed, {len(types)} distinct types, "
      f"{batches - failed}/{batches} superclass batches")
