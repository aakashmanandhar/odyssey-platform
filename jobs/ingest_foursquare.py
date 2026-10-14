# Databricks notebook source
# Odyssey bronze landing: Foursquare OS Places (gated, Apache-2.0) per destination box, release-aware and idempotent.
# Excludes the native Parquet GEOMETRY column `geom` (location is kept in latitude/longitude/bbox) so Spark can read it.

# COMMAND ----------
# MAGIC %pip install duckdb --quiet

# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
import json
import math
import os
import shutil
import time
from datetime import datetime, timezone

import duckdb
from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
dbutils.widgets.text("countries", "")
dbutils.widgets.text("radius_city_km", "6")
dbutils.widgets.text("radius_other_km", "15")
catalog = dbutils.widgets.get("catalog")
countries = [c.strip() for c in dbutils.widgets.get("countries").split(",") if c.strip()]
radius = {"city": float(dbutils.widgets.get("radius_city_km")),
          "other_destination": float(dbutils.widgets.get("radius_other_km"))}

# Latest release folder (listing is public; file access needs the token)
status, body = http_get("https://huggingface.co/api/datasets/foursquare/fsq-os-places/tree/main/release")
release = sorted(e["path"].split("dt=")[1] for e in json.loads(body) if "dt=" in e["path"])[-1]
src = f"hf://datasets/foursquare/fsq-os-places/release/dt={release}/places/parquet/*.parquet"
base = f"/Volumes/{catalog}/bronze/landing/foursquare_places/release={release}"

con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs;")
con.sql("SET enable_object_cache = true;")          # cache Parquet footers across the per-destination queries
con.sql(f"CREATE SECRET hf (TYPE huggingface, TOKEN '{dbutils.secrets.get('odyssey', 'hf_token')}')")

dests = spark.table(f"{catalog}.gold.dim_destination") \
    .select("destination_key", "country_key", "name", "kind", "lat", "lon").collect()
if countries:
    dests = [d for d in dests if d.country_key in countries]
print(f"Foursquare release {release}; {len(dests)} destinations")

logs, skipped, total_rows = [], 0, 0
for d in dests:
    target_dir = f"{base}/country={d.country_key}/destination={d.destination_key}"
    if os.path.exists(f"{target_dir}/places.parquet"):
        skipped += 1
        continue
    r = radius[d.kind]
    dlat, dlon = r / 111.0, r / (111.0 * max(math.cos(math.radians(d.lat)), 0.1))
    xmin, xmax, ymin, ymax = d.lon - dlon, d.lon + dlon, d.lat - dlat, d.lat + dlat

    start = time.time()
    local = f"/tmp/fsq_{d.destination_key}.parquet"
    con.sql(f"""
        COPY (
            SELECT * EXCLUDE (geom) FROM read_parquet('{src}')
            WHERE bbox.xmin >= {xmin} AND bbox.xmax <= {xmax} AND bbox.ymin >= {ymin} AND bbox.ymax <= {ymax}
        ) TO '{local}' (FORMAT PARQUET)
    """)
    rows = con.sql(f"SELECT count(*) FROM read_parquet('{local}')").fetchone()[0]
    os.makedirs(target_dir, exist_ok=True)
    shutil.copy(local, f"{target_dir}/places.parquet")
    os.remove(local)
    total_rows += rows
    logs.append((datetime.now(timezone.utc), "foursquare_os_places", release, f"{d.country_key}/{d.destination_key}",
                 rows, target_dir, int((time.time() - start) * 1000)))
    print(f"{d.country_key} {d.name[:28]:<28} {d.kind:<17} {rows:>7} places  {int(time.time() - start):>3}s")

if logs:
    spark.createDataFrame(logs, "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, "
                                "row_count BIGINT, path STRING, duration_ms BIGINT") \
         .write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")
print(f"DONE release {release}: {len(logs)} extracted ({total_rows:,} places), {skipped} skipped")
