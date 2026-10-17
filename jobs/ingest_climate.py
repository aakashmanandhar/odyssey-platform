# Databricks notebook source
# Odyssey bronze ingestion: monthly climate normals per destination.
# 1) NASA POWER climatology (2001-2025, ~50 km grid): humidity, cloud, sunshine, wind (and regional temperature/rain).
# 2) WorldClim 2.1 (1970-2000, 2.5 arc-minutes ~4.5 km, station-based with elevation): daily high/low and rainfall,
#    sampled per destination from the monthly GeoTIFFs. Zips are cached in the landing volume (static dataset).
#    Fick & Hijmans 2017, Int. J. Climatology 37(12): 4302-4315. Free for non-commercial use with citation.

# COMMAND ----------
# MAGIC %pip install rasterio --quiet

# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
import hashlib
import json
import os
import shutil
import time
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone

import rasterio

from odyssey_common import USER_AGENT, http_get

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
NASA = "https://power.larc.nasa.gov/api/temporal/climatology/point"
PARAMETERS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,CLOUD_AMT,ALLSKY_SFC_SW_DWN,WS2M"
WORLDCLIM = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_2.5m_{var}.zip"
LANDING = f"/Volumes/{catalog}/bronze/landing/worldclim"

dest = spark.table(f"{catalog}.silver.silver_destinations")
cols = dest.columns
lat_col = next((c for c in cols if c in ("lat", "latitude", "center_lat")), None)
lon_col = next((c for c in cols if c in ("lon", "lng", "longitude", "center_lon")), None)
rows = dest.select("destination_qid", "country_iso3", lat_col, lon_col).where(f"{lat_col} is not null").collect()
start, batch_id, now = time.time(), str(uuid.uuid4()), datetime.now(timezone.utc)

# 1) NASA POWER, one request per destination
raw, failed = [], []
for n, r in enumerate(rows, 1):
    if n % 50 == 0:
        print(f"  nasa {n}/{len(rows)}, {len(failed)} failed", flush=True)
    url = (f"{NASA}?parameters={PARAMETERS}&community=AG&format=JSON"
           f"&latitude={float(r[lat_col]):.4f}&longitude={float(r[lon_col]):.4f}")
    status, body = http_get(url, attempts=3, backoff_seconds=10, timeout=60)
    try:
        ok = body is not None and "parameter" in json.loads(body).get("properties", {})
    except ValueError:
        ok = False
    if not ok:
        failed.append(r.destination_qid)
        continue
    raw.append(("nasa_power_climatology", r.country_iso3, r.destination_qid, body, status, "climate_normals",
                now, batch_id, hashlib.sha256(body.encode()).hexdigest()))
    time.sleep(0.5)
if len(failed) > 0.1 * len(rows):
    raise Exception(f"NASA POWER: {len(failed)}/{len(rows)} destinations failed {failed[:5]}; not storing")

# 2) WorldClim: download each variable once into the landing volume, then sample every month at every destination
os.makedirs(LANDING, exist_ok=True)
points = [(r.destination_qid, r.country_iso3, float(r[lon_col]), float(r[lat_col])) for r in rows]
wc_rows = []
for var in ("tmax", "tmin", "prec"):
    zpath = f"{LANDING}/wc2.1_2.5m_{var}.zip"
    if not os.path.exists(zpath):
        print(f"  downloading WorldClim {var} ...", flush=True)
        req = urllib.request.Request(WORLDCLIM.format(var=var), headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=600) as resp, open("/tmp/wc.zip", "wb") as out:
            shutil.copyfileobj(resp, out)
        shutil.copy("/tmp/wc.zip", zpath)
        os.remove("/tmp/wc.zip")
    with zipfile.ZipFile(zpath) as z:
        for month in range(1, 13):
            name = f"wc2.1_2.5m_{var}_{month:02d}.tif"
            z.extract(name, "/tmp/wc")
            with rasterio.open(f"/tmp/wc/{name}") as src:
                nodata = src.nodata
                for (qid, iso, lon, lat), v in zip(points, src.sample([(p[2], p[3]) for p in points])):
                    val = float(v[0])
                    if (nodata is not None and val == nodata) or val < -1e30:
                        val = None
                    wc_rows.append((qid, iso, var, month, val, name, "worldclim_2_1", now, batch_id))
            os.remove(f"/tmp/wc/{name}")
    print(f"  worldclim {var}: sampled 12 months x {len(points)} destinations", flush=True)

nulls = sum(1 for w in wc_rows if w[4] is None)
spark.createDataFrame(raw, "query_name STRING, country_iso3 STRING, destination_qid STRING, response_json STRING, "
                      "http_status INT, _source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING"
                      ).write.mode("append").saveAsTable(f"{catalog}.bronze.climate_raw")
spark.createDataFrame(wc_rows, "destination_qid STRING, country_iso3 STRING, variable STRING, month INT, value DOUBLE, "
                      "source_file STRING, _source STRING, _ingested_at TIMESTAMP, _batch_id STRING"
                      ).write.mode("append").saveAsTable(f"{catalog}.bronze.climate_worldclim_raw")
spark.createDataFrame(
    [(now, "climate_normals", batch_id, "ALL/nasa_power+worldclim", len(raw) + len(wc_rows),
      f"{catalog}.bronze.climate_raw", int((time.time() - start) * 1000))],
    "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
    "path STRING, duration_ms BIGINT").write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")
print(f"BATCH {batch_id}: NASA {len(raw)}/{len(rows)} destinations ({len(failed)} failed); "
      f"WorldClim {len(wc_rows)} values ({nulls} without data, e.g. points over sea)")
