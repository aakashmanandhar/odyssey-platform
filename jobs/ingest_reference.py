# Databricks notebook source
# Odyssey bronze ingestion: country facts (Wikidata) and curated destinations (Wikivoyage -> Wikidata).
# Every API response is stored raw; parsing for analytics happens in dbt silver.
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")

UA = "OdysseyPlatform/0.1 (https://aakashmanandhar.tech/odyssey)"
WD_SPARQL = "https://query.wikidata.org/sparql"
WV_API = "https://en.wikivoyage.org/w/api.php"

COUNTRY_FACTS = """
SELECT ?capitalLabel ?population ?area ?currencyCode ?languageLabel ?coord WHERE {
  OPTIONAL { wd:{qid} wdt:P36 ?capital . ?capital rdfs:label ?capitalLabel . FILTER(lang(?capitalLabel) = "en") }
  OPTIONAL { wd:{qid} wdt:P1082 ?population }
  OPTIONAL { wd:{qid} wdt:P2046 ?area }
  OPTIONAL { wd:{qid} wdt:P38 ?currency . ?currency wdt:P498 ?currencyCode }
  OPTIONAL { wd:{qid} wdt:P37 ?language . ?language rdfs:label ?languageLabel . FILTER(lang(?languageLabel) = "en") }
  OPTIONAL { wd:{qid} wdt:P625 ?coord }
}"""

DESTINATION_DETAILS = """
SELECT ?item ?itemLabel ?coord ?population ?popDate ?sitelinks
       (GROUP_CONCAT(DISTINCT ?typeLabel; separator=";") AS ?types) WHERE {
  VALUES ?item { {values} }
  OPTIONAL { ?item rdfs:label ?itemLabel . FILTER(lang(?itemLabel) = "en") }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item p:P1082 ?popStatement . ?popStatement ps:P1082 ?population ; wikibase:rank ?rank .
             FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?popStatement pq:P585 ?popDate } }
  OPTIONAL { ?item wikibase:sitelinks ?sitelinks }
  OPTIONAL { ?item wdt:P31 ?type . ?type rdfs:label ?typeLabel . FILTER(lang(?typeLabel) = "en") }
}
GROUP BY ?item ?itemLabel ?coord ?population ?popDate ?sitelinks"""

SECTIONS = {"city": r"(?:Cities|Towns)[^=\n]*", "other_destination": r"Other destinations"}
FIRST_LINK = re.compile(r"^[*#].*?\[\[([^\]|#]+)", re.M)  # first [[link]] on each bullet line


def http_get(url, accept="application/json", attempts=3):
    """GET with retries and backoff. Returns (status, body) or (None, None)."""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, resp.read().decode("utf-8")
        except Exception as e:
            print(f"    attempt {attempt} failed: {type(e).__name__}: {str(e)[:120]}")
            if attempt == attempts:
                return None, None
            time.sleep(5 * attempt)


def sparql(query):
    return http_get(WD_SPARQL + "?" + urllib.parse.urlencode({"query": query}), "application/sparql-results+json")


def wikivoyage(params):
    return http_get(WV_API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"}))


def discover(wikitext):
    """Destination titles from the Cities and Other destinations sections, in page order."""
    found = []
    for pattern in SECTIONS.values():
        m = re.search(rf"^==\s*{pattern}\s*==\s*$(.*?)(?=^==[^=]|\Z)", wikitext, re.M | re.S)
        if m:
            found += [t.strip() for t in FIRST_LINK.findall(m.group(1))]
    return list(dict.fromkeys(found))  # de-duplicate, keep order


countries = spark.table(f"{catalog}.silver.pilot_countries").select("iso3", "wikidata_id", "country_name").collect()
batch_id = str(uuid.uuid4())
raw = {"wikidata_raw": [], "wikivoyage_raw": []}
logs, failures = [], []


def keep(table, source, name, c, status, body, n, start):
    raw[table].append((name, c.iso3, c.wikidata_id, body, status, source, datetime.now(timezone.utc),
                       batch_id, hashlib.sha256(body.encode()).hexdigest()))
    logs.append((datetime.now(timezone.utc), source, batch_id, f"{c.iso3}/{name}", n,
                 f"{catalog}.bronze.{table}", int((time.time() - start) * 1000)))


for c in countries:
    # 1. Country facts
    t = time.time(); status, body = sparql(COUNTRY_FACTS.replace("{qid}", c.wikidata_id))
    if body is None: failures.append(f"{c.iso3}/country_facts"); continue
    keep("wikidata_raw", "wikidata", "country_facts", c, status, body, len(json.loads(body)["results"]["bindings"]), t)

    # 2. Wikivoyage country page
    t = time.time(); status, body = wikivoyage({"action": "parse", "page": c.country_name, "prop": "wikitext", "redirects": "1"})
    if body is None or "parse" not in json.loads(body): failures.append(f"{c.iso3}/country_page"); continue
    titles = discover(json.loads(body)["parse"]["wikitext"])
    keep("wikivoyage_raw", "wikivoyage", "country_page", c, status, body, len(titles), t)

    # 3. Resolve titles to Wikidata IDs (up to 50 per call)
    t = time.time(); status, body = wikivoyage({"action": "query", "prop": "pageprops", "ppprop": "wikibase_item",
                                                "redirects": "1", "titles": "|".join(titles[:50])})
    if body is None: failures.append(f"{c.iso3}/destination_pageprops"); continue
    pages = json.loads(body)["query"].get("pages", [])
    qids = [p["pageprops"]["wikibase_item"] for p in pages if p.get("pageprops", {}).get("wikibase_item")]
    keep("wikivoyage_raw", "wikivoyage", "destination_pageprops", c, status, body, len(qids), t)

    # 4. Wikidata details for exactly those IDs
    t = time.time(); status, body = sparql(DESTINATION_DETAILS.replace("{values}", " ".join("wd:" + q for q in qids)))
    if body is None: failures.append(f"{c.iso3}/destination_details"); continue
    n_details = len(json.loads(body)["results"]["bindings"])
    keep("wikidata_raw", "wikidata", "destination_details", c, status, body, n_details, t)

    print(f"{c.country_name:<12} destinations found {len(titles):>3} | resolved to Wikidata {len(qids):>3} | detail rows {n_details:>3}")
    time.sleep(1)

schema = ("query_name STRING, country_iso3 STRING, country_qid STRING, response_json STRING, http_status INT, "
          "_source STRING, _ingested_at TIMESTAMP, _batch_id STRING, _payload_hash STRING")
for table, rows in raw.items():
    if rows:
        spark.createDataFrame(rows, schema).write.mode("append").saveAsTable(f"{catalog}.bronze.{table}")
if logs:
    spark.createDataFrame(logs, "run_at TIMESTAMP, source_id STRING, source_release STRING, area STRING, row_count BIGINT, "
                                "path STRING, duration_ms BIGINT").write.mode("append").saveAsTable(f"{catalog}.ops.extract_log")

print(f"BATCH {batch_id}: {sum(len(r) for r in raw.values())} responses stored, {len(failures)} failed")
if failures:
    raise Exception(f"Reference ingestion failed for: {failures}")
