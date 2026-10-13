# Databricks notebook source
# Odyssey bronze landing: Overture places per destination bounding box, release-aware and idempotent.

# COMMAND ----------
# MAGIC %pip install duckdb --quiet

# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
import math
import os
import shutil
import time
from datetime import datetime, timezone

import duckdb

dbutils.widgets.text("catalog", "odyssey_dev")
dbutils.widgets.text("countries", "")          # e.g. "NPL" or "NPL,ISL"; empty = all pilot countries
dbutils.widgets.text("radius_city_km", "6")
dbutils.widgets.text("radius_other_km", "15")
catalog = dbutils.widgets.get("catalog")
countries = [c.strip() for c in dbutils.widgets.get("countries").split(",") if c.strip()]
radius = {"city": float(dbutils.widgets.get("radius_city_km")),
          "other_destination": float(dbutils.widgets.get("radius_other_km"))}

dests = spark.table(f"{catalog}.gold.dim_destination") \
    .select("destination_key", "country_key", "name", "kind", "lat", "lon").collect()
if countries:
    dests = [d for d in dests if d.country_key in countries]

con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
files = con.sql("SELECT file FROM glob('s3://overturemaps-us-west-2/release/*/theme=places/type=place/*')").fetchall()
release = sorted({f[0].split("/release/")[1].split("/")[0] for f in files})[-1]
src = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
base = f"/Volumes/{catalog}/bronze/landing/overture_places/release={release}"
print(f"Overture release {release}; {len(dests)} destinations")

logs, skipped, total_rows = [], 0, 0
for d in dests:
    target_dir = f"{base}/country={d.country_key}/destination={d.destination_key}"
    if os.path.exists(f"{target_dir}/places.parquet"):
        skipped += 1
        continue
    r = radius[d.kind]
    dlat = r / 111.0                                                  # ~111 km per degree of latitude
    dlon = r / (111.0 * max(math.cos(math.radians(d.lat)), 0.1))      # longitude degrees shrink towards the poles
    xmin, xmax, ymin, ymax = d.lon - dlon, d.lon + dlon, d.lat - dlat, d.lat + dlat

    start = time.time()
    local = f"/tmp/overture_{d.destination_key}.parquet"
    con.sql(f"""
        COPY (
            SELECT * FROM read_parquet('{src}', hive_partitioning = false)
            WHERE bbox.xmin >= {xmin} AND bbox.xmax <= {xmax} AND bbox.ymin >= {ymin} AND bbox.ymax <= {ymax}
        ) TO '{local}' (FORMAT PARQUET)
    """)
    rows = con.sql(f"SELECT count(*) FROM read_parquet('{local}')").fetchone()[0]
    os.makedirs(target_dir, exist_ok=True)
    shutil.copy(local, f"{target_dir}/places.parquet")
    os.remove(local)
    total_rows += rows
    logs.append((datetime.now(timezone.utc), "overture_places", release, f"{d.country_key}/{d.destination_key}",
                 rows, target_dir, int((time.time() - start) * 1000)))
    print(f"{d.country_key} {d.name[:28]:<28} {d.kind:<17} {rows:>7} places  {int(time.time() - start):>3}s")

if logs:
    spark.createDataFrame(logs, "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, "
                                "row_count BIGINT, path STRING, duration_ms BIGINT") \
         .write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")

if logs:
    spark_rows = spark.read.parquet(*[l[5] + "/places.parquet" for l in logs]).count()
    if spark_rows != total_rows:
        raise Exception(f"Row count mismatch: DuckDB {total_rows} vs Spark {spark_rows}")
print(f"DONE release {release}: {len(logs)} extracted ({total_rows:,} places), {skipped} already present (skipped)")
