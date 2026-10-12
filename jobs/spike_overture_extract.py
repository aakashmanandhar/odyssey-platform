# Databricks notebook source
# Odyssey spike: extract Overture places for one bounding box with DuckDB on serverless.

# COMMAND ----------
# MAGIC %pip install duckdb --quiet

# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
import os
import shutil
import time
from datetime import datetime, timezone

import duckdb

dbutils.widgets.text("catalog", "odyssey_dev")
dbutils.widgets.text("area", "kathmandu")
dbutils.widgets.text("bbox", "85.25,27.65,85.40,27.75")  # xmin,ymin,xmax,ymax = lon/lat
catalog = dbutils.widgets.get("catalog")
area = dbutils.widgets.get("area")
xmin, ymin, xmax, ymax = [float(v) for v in dbutils.widgets.get("bbox").split(",")]

con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")

# Discover the latest release from the public bucket instead of hard-coding it
files = con.sql("SELECT file FROM glob('s3://overturemaps-us-west-2/release/*/theme=places/type=place/*')").fetchall()
releases = sorted({f[0].split("/release/")[1].split("/")[0] for f in files})
release = releases[-1]
print("available releases:", releases, "-> using", release)

# Extract only the places inside the bounding box, as delivered (bronze = raw)
start = time.time()
src = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
local = f"/tmp/overture_places_{area}.parquet"
con.sql(f"""
    COPY (
        SELECT * FROM read_parquet('{src}', hive_partitioning = false)
        WHERE bbox.xmin >= {xmin} AND bbox.xmax <= {xmax}
          AND bbox.ymin >= {ymin} AND bbox.ymax <= {ymax}
    ) TO '{local}' (FORMAT PARQUET)
""")
rows = con.sql(f"SELECT count(*) FROM read_parquet('{local}')").fetchone()[0]
duration_ms = int((time.time() - start) * 1000)

# Land it in the bronze landing volume, partitioned by release and area
target_dir = f"/Volumes/{catalog}/bronze/landing/overture_places/release={release}/area={area}"
os.makedirs(target_dir, exist_ok=True)
target = f"{target_dir}/places.parquet"
shutil.copy(local, target)

# Prove Spark can read DuckDB's output and nothing was lost on the way
spark_rows = spark.read.parquet(target).count()
if spark_rows != rows:
    raise Exception(f"Row count mismatch: DuckDB {rows} vs Spark {spark_rows}")

spark.createDataFrame(
    [(datetime.now(timezone.utc), "overture_places", release, area, rows, target, duration_ms)],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, "
    "row_count BIGINT, path STRING, duration_ms BIGINT",
).write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")

columns = [c[0] for c in con.sql(f"DESCRIBE SELECT * FROM read_parquet('{local}')").fetchall()]
samples = [r[0] for r in con.sql(f"SELECT names.primary FROM read_parquet('{local}') LIMIT 5").fetchall()]
print(f"SPIKE OK: {rows} places for {area} from release {release} in {duration_ms} ms")
print(f"Spark read-back: {spark_rows} rows | file: {target}")
print("columns:", columns)
print("sample names:", samples)
