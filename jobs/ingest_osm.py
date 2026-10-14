# Databricks notebook source
# NOT SCHEDULED (ADR-010): public Overpass instances proved unreliable (504s and timeouts for all
# mirrors, 2026-10-14). Kept for a future bulk-extract-based OSM source; run manually only.
# Odyssey bronze landing: OpenStreetMap places (Overpass API) per destination box, monthly snapshot, idempotent.
import json
import math
import os
import time
import urllib.parse
from datetime import date, datetime, timezone

from odyssey_common import http_get

dbutils.widgets.text("catalog", "odyssey_dev")
dbutils.widgets.text("countries", "")
dbutils.widgets.text("radius_city_km", "6")
dbutils.widgets.text("radius_other_km", "15")
catalog = dbutils.widgets.get("catalog")
countries = [c.strip() for c in dbutils.widgets.get("countries").split(",") if c.strip()]
radius = {"city": float(dbutils.widgets.get("radius_city_km")),
          "other_destination": float(dbutils.widgets.get("radius_other_km"))}

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def fetch(query, start_index):
    """Try each Overpass mirror in turn (starting at start_index). Returns (host, body, remark)."""
    remark = "no response"
    for i in range(len(ENDPOINTS)):
        endpoint = ENDPOINTS[(start_index + i) % len(ENDPOINTS)]
        status, body = http_get(endpoint + "?" + urllib.parse.urlencode({"data": query}),
                                timeout=150, attempts=2, backoff_seconds=10)
        if body is None:
            continue
        remark = json.loads(body).get("remark", "")
        if "error" not in remark.lower():
            return endpoint.split("/")[2], body, ""
    return None, None, remark
QUERY = """[out:json][timeout:120];
(
  nwr["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|ice_cream|biergarten)$"]["name"]({bbox});
  nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment|camp_site|alpine_hut|attraction|museum|viewpoint|gallery|zoo|theme_park)$"]["name"]({bbox});
  nwr["historic"]["name"]({bbox});
);
out center tags;"""

snapshot = date.today().strftime("%Y-%m")
base = f"/Volumes/{catalog}/bronze/landing/osm_places/snapshot={snapshot}"
dests = spark.table(f"{catalog}.gold.dim_destination") \
    .select("destination_key", "country_key", "name", "kind", "lat", "lon").collect()
if countries:
    dests = [d for d in dests if d.country_key in countries]
print(f"OSM snapshot {snapshot}; {len(dests)} destinations")

logs, failures, skipped = [], [], 0
for d in dests:
    target_dir = f"{base}/country={d.country_key}/destination={d.destination_key}"
    if os.path.exists(f"{target_dir}/osm.json"):
        skipped += 1
        continue
    r = radius[d.kind]
    dlat, dlon = r / 111.0, r / (111.0 * max(math.cos(math.radians(d.lat)), 0.1))
    bbox = f"{d.lat - dlat:.5f},{d.lon - dlon:.5f},{d.lat + dlat:.5f},{d.lon + dlon:.5f}"   # south,west,north,east

    start = time.time()
    host, body, remark = fetch(QUERY.replace("{bbox}", bbox), start_index=len(logs) + len(failures))
    if body is None:
        failures.append(f"{d.country_key}/{d.name}: {remark[:100]}")
        print(f"{d.country_key} {d.name[:28]:<28} FAILED: {remark[:100]}")
        continue
    n = len(json.loads(body).get("elements", []))
    os.makedirs(target_dir, exist_ok=True)
    with open(f"{target_dir}/osm.json", "w") as f:
        f.write(body)
    logs.append((datetime.now(timezone.utc), "osm", snapshot, f"{d.country_key}/{d.destination_key}",
                 n, target_dir, int((time.time() - start) * 1000)))
    print(f"{d.country_key} {d.name[:28]:<28} {d.kind:<17} {n:>6} places  {int(time.time() - start):>3}s  via {host}")
    time.sleep(2)  # shared public service: one query at a time, with a pause

if logs:
    spark.createDataFrame(logs, "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, "
                                "row_count BIGINT, path STRING, duration_ms BIGINT") \
         .write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")
print(f"DONE snapshot {snapshot}: {len(logs)} fetched, {skipped} skipped, {len(failures)} failed")
if failures:
    raise Exception(f"Overpass failures (rerun to retry only these): {failures}")
