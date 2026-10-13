"""Generate dbt seed CSVs from the YAML configs (single source of truth: config/)."""
import csv
import yaml

sources = yaml.safe_load(open("config/sources.yml"))["sources"]
with open("transform/seeds/source_registry.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["source_id", "source_name", "feeds", "method", "cadence", "phase",
                "license", "license_status", "url", "notes"])
    for s in sources:
        w.writerow([s["id"], s["name"], ";".join(s["feeds"]), s["method"], s["cadence"],
                    s["phase"], s["license"], s["license_status"], s.get("url") or "", s.get("notes") or ""])

countries = yaml.safe_load(open("config/pilot_countries.yml"))["countries"]
with open("transform/seeds/pilot_countries.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["iso2", "iso3", "wikidata_id", "country_name", "region", "focus"])
    for c in countries:
        w.writerow([c["iso2"], c["iso3"], c["wikidata"], c["name"], c["region"], ";".join(c["focus"])])

print(f"seeds written: source_registry ({len(sources)} rows), pilot_countries ({len(countries)} rows)")
