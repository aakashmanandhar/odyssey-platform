# Databricks notebook source
# Odyssey serving export: gold tables -> versioned JSON snapshot for the static web app.
# Layout: /Volumes/<catalog>/gold/exports/snapshots/<run_id>/{index.json, trust.json, manifest.json,
#         countries/<ISO3>.json, destinations/<QID>.json}; /Volumes/<catalog>/gold/exports/LATEST holds <run_id>.
# The web server pulls LATEST, verifies manifest.json and swaps folders atomically. Keeps the newest 7 snapshots.
import datetime as dt
import decimal
import hashlib
import json
import os
import shutil
from collections import defaultdict

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")
G, S, O = f"{catalog}.gold", f"{catalog}.silver", f"{catalog}.ops"
ROOT = f"/Volumes/{catalog}/gold/exports"
run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
OUT = f"{ROOT}/snapshots/{run_id}"
today = dt.date.today()

def rows(sql):
    def clean(v):
        if isinstance(v, decimal.Decimal):
            return float(v)
        if isinstance(v, (dt.date, dt.datetime)):
            return v.isoformat()
        if isinstance(v, list):
            return [clean(x) for x in v]
        if isinstance(v, dict):
            return {k: clean(x) for k, x in v.items()}
        if hasattr(v, "asDict"):
            return {k: clean(x) for k, x in v.asDict(recursive=True).items()}
        return v
    return [{k: clean(v) for k, v in r.asDict(recursive=True).items()} for r in spark.sql(sql).collect()]

def image(url, credit, license_short=None, page=None):
    if not url:
        return None
    return {"id": hashlib.sha1(url.encode()).hexdigest()[:16], "src": url, "credit": credit,
            "license": license_short, "page": page}

written = {}
def write(rel, obj):
    path = f"{OUT}/{rel}"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as f:
        f.write(data)
    written[rel] = {"bytes": len(data.encode()), "sha256": hashlib.sha256(data.encode()).hexdigest()}

# ---------- shared lookups ----------
dests = rows(f"select * from {G}.dim_destination")
dest_by_country = defaultdict(list)
for d in dests:
    dest_by_country[d["country_key"]].append(d)

imgs = rows(f"""select destination_key, role, is_hero, thumb_url, credit_text, license_short, commons_page_url
                from {G}.dim_destination_image""")
hero, banner = {}, {}
for i in imgs:
    img = image(i["thumb_url"], i["credit_text"], i["license_short"], i["commons_page_url"])
    if i["is_hero"]:
        hero[i["destination_key"]] = img
    if i["role"] == "banner":
        banner[i["destination_key"]] = img

climate = defaultdict(list)
for c in rows(f"""select destination_key, month_num, month_name, temp_mean_c, temp_max_c, temp_min_c, rain_mm_month,
                         humidity_pct, cloud_pct, sunshine_mj_m2_day, wind_m_s, comfort_score, season_label,
                         is_top_month, temp_rain_source
                  from {G}.fact_destination_climate_month order by destination_key, month_num"""):
    climate[c.pop("destination_key")].append(c)

highlights = defaultdict(list)
for h in rows(f"""select destination_key, highlight_rank, title, local_title, category, wiki_type, highlight_score,
                         views_30d, odyssey_place_id, is_in_place_index, wikipedia_page_id, wikidata_id, lat, lon,
                         photo_url, photo_credit
                  from {G}.mart_destination_highlights order by destination_key, highlight_rank"""):
    key = h.pop("destination_key")
    h["photo"] = image(h.pop("photo_url"), h.pop("photo_credit"))
    highlights[key].append(h)

place_counts = defaultdict(dict)
for p in rows(f"""select destination_key, odyssey_category, count(*) as places
                  from {G}.dim_place where not coalesce(is_closed, false) and destination_key is not null
                  group by 1, 2"""):
    place_counts[p["destination_key"]][p["odyssey_category"]] = p["places"]

profiles = {p["country_key"]: p for p in rows(f"select * from {G}.mart_country_profile")}
countries = {c["country_key"]: c for c in rows(f"select * from {G}.dim_country")}

# ---------- destinations/<QID>.json ----------
for d in dests:
    k = d["destination_key"]
    months = climate.get(k, [])
    write(f"destinations/{k}.json", {
        "destination": d,
        "country": {"key": d["country_key"], "name": countries.get(d["country_key"], {}).get("country_name")},
        "hero": hero.get(k), "banner": banner.get(k),
        "highlights": highlights.get(k, []),
        "climate": {"months": months,
                    "best_months": [m["month_name"] for m in months if m["season_label"] == "best"],
                    "top_months": [m["month_name"] for m in months if m["is_top_month"]],
                    "peak_comfort": max([m["comfort_score"] for m in months], default=None)},
        "places_by_category": place_counts.get(k, {}),
    })

# ---------- countries/<ISO3>.json ----------
advisories = {a["country_key"]: a for a in rows(f"select * from {G}.fact_advisory where is_current")}
holidays = defaultdict(list)
for h in rows(f"""select country_key, holiday_date, holiday_name from {G}.fact_public_holiday
                  where holiday_date between current_date() and date_add(current_date(), 365) order by holiday_date"""):
    holidays[h.pop("country_key")].append(h)
tourism = defaultdict(list)
for t in rows(f"""select country_key, year, arrivals, receipts_usd, price_level_ratio, arrivals_per_resident,
                         receipts_per_arrival_usd, is_pandemic_year
                  from {G}.fact_tourism_country_year order by country_key, year"""):
    tourism[t.pop("country_key")].append(t)
visas = defaultdict(dict)
for v in rows(f"""select destination_country_key, passport_iso3, requirement_category, visa_free_days, data_published_at
                  from {G}.fact_visa_requirement"""):
    visas[v["destination_country_key"]][v["passport_iso3"]] = {
        "category": v["requirement_category"], "days": v["visa_free_days"]}
visa_as_of = rows(f"select max(data_published_at) as d from {G}.fact_visa_requirement")[0]["d"]
fx_series = defaultdict(list)
for f in rows(f"""select currency_key, rate_date, rate_per_eur from {G}.fact_fx_rate_daily
                  where rate_date >= date_sub(current_date(), 120) order by currency_key, rate_date"""):
    fx_series[f.pop("currency_key")].append(f)
currencies = {c["currency_key"]: c for c in rows(f"select * from {G}.dim_currency")}

for ck, c in countries.items():
    prof = profiles.get(ck, {})
    cur = prof.get("primary_currency")
    country_dests = sorted(dest_by_country.get(ck, []), key=lambda d: (d.get("wikivoyage_rank") or 99, d["name"]))
    write(f"countries/{ck}.json", {
        "country": c, "profile": prof,
        "advisory": advisories.get(ck),
        "money": {"currency": cur, "current": currencies.get(cur), "series_120d": fx_series.get(cur, [])},
        "holidays_next_12_months": holidays.get(ck, []),
        "tourism": tourism.get(ck, []),
        "visa": {"as_of": visa_as_of, "by_passport": visas.get(ck, {})},
        "destinations": [{"key": d["destination_key"], "name": d["name"], "kind": d["kind"],
                          "lat": d["lat"], "lon": d["lon"], "hero": hero.get(d["destination_key"]),
                          "best_months": [m["month_name"] for m in climate.get(d["destination_key"], [])
                                          if m["season_label"] == "best"],
                          "highlights": len(highlights.get(d["destination_key"], []))}
                         for d in country_dests],
    })

# ---------- index.json (home, globe, search) ----------
index_countries = []
for ck, c in countries.items():
    prof = profiles.get(ck, {})
    with_hero = [d for d in dest_by_country.get(ck, []) if d["destination_key"] in hero]
    cover = max(with_hero, key=lambda d: d.get("sitelinks") or 0, default=None)
    index_countries.append({"key": ck, "name": c["country_name"], "region": c["region"], "capital": c["capital"],
                            "lat": c["lat"], "lon": c["lon"], "advisory_level": prof.get("advisory_level"),
                            "advisory_label": prof.get("advisory_label"), "currency": prof.get("primary_currency"),
                            "rate_per_eur": prof.get("rate_per_eur"), "destinations": prof.get("destinations"),
                            "cover": hero.get(cover["destination_key"]) if cover else None})
index_destinations = []
search = []
for d in dests:
    k = d["destination_key"]
    months = climate.get(k, [])
    hl = highlights.get(k, [])
    index_destinations.append({"key": k, "name": d["name"], "country_key": d["country_key"], "kind": d["kind"],
                               "lat": d["lat"], "lon": d["lon"], "hero": hero.get(k),
                               "best_months": [m["month_name"] for m in months if m["season_label"] == "best"],
                               "peak_comfort": max([m["comfort_score"] for m in months], default=None),
                               "top_highlights": [h["title"] for h in hl[:3]], "highlights": len(hl)})
    search.append({"type": "destination", "label": d["name"], "key": k, "country_key": d["country_key"]})
    for h in hl[:15]:
        search.append({"type": "place", "label": h["title"], "key": k, "country_key": d["country_key"],
                       "rank": h["highlight_rank"]})
for c in index_countries:
    search.append({"type": "country", "label": c["name"], "key": c["key"], "country_key": c["key"]})
write("index.json", {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "run_id": run_id,
                     "countries": sorted(index_countries, key=lambda c: c["name"]),
                     "destinations": index_destinations, "search": search})

# ---------- trust.json ----------
freshness = rows(f"""select source_id, max(run_at) as last_run, max_by(row_count, run_at) as last_rows
                     from {O}.extract_log group by source_id order by source_id""")
try:
    er_eval = rows(f"select * from {S}.er_eval_metrics")
except Exception:
    er_eval = []
try:
    sources = rows(f"select * from {G}.dim_source")
except Exception:
    sources = []
counts = rows(f"""select
    (select count(*) from {G}.dim_place) as golden_places,
    (select count(*) from {G}.dim_destination) as destinations,
    (select count(*) from {G}.dim_country) as countries,
    (select count(*) from {G}.mart_destination_highlights) as highlights,
    (select count(*) from {G}.dim_place_wiki where has_photo) as place_photos,
    (select count(*) from {G}.dim_destination_image where is_hero) as destination_photos""")[0]
write("trust.json", {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "counts": counts,
                     "freshness": freshness, "entity_resolution_eval": er_eval, "sources": sources})

# ---------- manifest + LATEST pointer + retention ----------
manifest = {"run_id": run_id, "catalog": catalog, "files": written,
            "countries": len(countries), "destinations": len(dests)}
with open(f"{OUT}/manifest.json", "w") as f:
    json.dump(manifest, f, separators=(",", ":"))
with open(f"{ROOT}/LATEST.tmp", "w") as f:
    f.write(run_id)
os.replace(f"{ROOT}/LATEST.tmp", f"{ROOT}/LATEST")
snaps = sorted(os.listdir(f"{ROOT}/snapshots"))
for old in snaps[:-7]:
    shutil.rmtree(f"{ROOT}/snapshots/{old}", ignore_errors=True)
total = sum(v["bytes"] for v in written.values())
print(f"SNAPSHOT {run_id}: {len(written)} files, {total / 1e6:.1f} MB "
      f"({len(countries)} countries, {len(dests)} destinations), kept {min(len(snaps), 7)} snapshots")
