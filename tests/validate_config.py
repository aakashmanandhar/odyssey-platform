"""Validate Odyssey config files. Exits 1 on any error (used later in CI)."""
import sys
import yaml

REQUIRED = {"id", "name", "feeds", "method", "cadence", "phase", "license", "license_status", "url"}
CADENCES = {"realtime", "daily", "weekly", "monthly", "quarterly", "yearly", "static"}
errors = []

sources = yaml.safe_load(open("config/sources.yml"))["sources"]
ids = [s.get("id") for s in sources]
for dup in {i for i in ids if ids.count(i) > 1}:
    errors.append(f"duplicate source id: {dup}")
for s in sources:
    if REQUIRED - s.keys():
        errors.append(f"{s.get('id')}: missing {sorted(REQUIRED - s.keys())}")
    if s.get("cadence") not in CADENCES:
        errors.append(f"{s.get('id')}: bad cadence {s.get('cadence')}")
    if s.get("license_status") not in {"verified", "verify"}:
        errors.append(f"{s.get('id')}: bad license_status")

countries = yaml.safe_load(open("config/pilot_countries.yml"))["countries"]
for c in countries:
    if len(str(c["iso2"])) != 2 or len(str(c["iso3"])) != 3:
        errors.append(f"{c['name']}: bad ISO code")
if len({c["iso3"] for c in countries}) != len(countries):
    errors.append("duplicate country iso3")

to_verify = [s["id"] for s in sources if s["license_status"] == "verify"]
print(f"sources: {len(sources)} | countries: {len(countries)} | licenses to verify: {len(to_verify)}")
print("to verify:", ", ".join(to_verify))
print("ERRORS:" if errors else "OK: config valid", *errors, sep="\n")
sys.exit(1 if errors else 0)
