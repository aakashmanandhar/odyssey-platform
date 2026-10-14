# Architecture decisions

Short records of significant decisions: context, decision, consequences. Newest last.

## ADR-001: Catalogs are created in the UI, managed contents in Terraform
**Date:** 2026-10-12
**Context:** Databricks Free Edition uses Default Storage, with no metastore storage root. The Terraform provider cannot create catalogs on Default Storage ("Metastore storage root URL does not exist").
**Decision:** `odyssey_dev` and `odyssey` were created once in the Catalog Explorer UI. Terraform reads them as `data "databricks_catalog"` sources and manages all schemas and volumes inside them.
**Consequences:** Catalog creation is a one-time manual bootstrap step. Everything below catalog level stays in code.

## ADR-002: Extractors run natively on Databricks serverless
**Date:** 2026-10-12
**Context:** It was unknown whether Free Edition serverless compute could reach external APIs.
**Decision:** The `connectivity_probe` job tested Wikidata, World Bank, ECB, Nager.Date, Wikipedia pageviews and the GitHub API: 6/6 returned HTTP 200 (48 to 735 ms). Extractors therefore run as Databricks jobs, with no VPS-side ingestion.
**Consequences:** One orchestrator (Lakeflow Jobs) from source to gold. The probe stays as a recurring source-availability check, logged to `ops.connectivity_probe`.

## ADR-003: License review of all sources
**Date:** 2026-10-12
**Context:** Ten sources had unconfirmed licenses. Odyssey publishes data publicly, so every source must permit that.
**Decision:**
- UN Tourism is dropped: its database is not openly downloadable. Arrivals and receipts come from World Bank (CC BY 4.0).
- Nager.Date is replaced by the MIT-licensed Python `holidays` package (no clear data license for the API).
- German Foreign Office advisories are shown complete, current and attributed, and are never summarized by an LLM. AI answers that mention safety carry a warning and a link to the original. Use is registered with the Foreign Office before go-live.
- Overture's license is per record (CDLA-Permissive-2.0, Apache-2.0, CC0-1.0). Merged with OSM, the golden place layer is published under ODbL.
- Foursquare OS Places is Apache-2.0 but gated on Hugging Face, so ingestion uses a Hugging Face token.
- Wikimedia EventStreams is deferred to Phase 7.
**Consequences:** 15 of 16 sources verified; conditions are recorded per source in `config/sources.yml` and shown on the Trust page.

## ADR-004: Overture places extracted with DuckDB on serverless
**Date:** 2026-10-12
**Context:** Overture places is a large global GeoParquet dataset on S3. Odyssey needs only the pilot areas, inside Free Edition's compute quota.
**Decision:** A serverless job installs DuckDB, discovers the latest release by listing the public bucket, and extracts only places inside a bounding box into the bronze landing volume (`release=<id>/area=<name>`). Spark reads the file back and must match the DuckDB row count.
**Evidence:** Kathmandu from release 2026-09-23.1: 40,081 places in 5.5 s of extract time, Spark row count matched, logged in `ops.extract_log`.
**Consequences:** Bounding-box extraction is the ingestion pattern for all large geospatial sources; scaling out means adding bounding boxes, not code.

## ADR-005: World Bank tourism series end in 2019/2020; pandemic years flagged
**Date:** 2026-10-13
**Context:** In the World Bank API, arrivals and receipts for the pilot countries end in 2019 or 2020 (Iceland's receipts in 2008), while population and price data run to 2025. 2020 is the pandemic collapse, so "latest arrivals" would badly misrepresent tourism today. The price level ratio indicator (PA.NUS.PPPC.RF) was retired, so it is computed as PA.NUS.PPP / PA.NUS.FCRF.
**Decision:** `fact_tourism_country_year` flags 2020 and 2021 as `is_pandemic_year`. Volume-based metrics (arrivals per resident, overtourism) use 2019 as a labelled pre-pandemic baseline. Current demand comes from Wikipedia pageviews (Phase 4). Our World in Data's republished UN Tourism series is a candidate for newer figures, pending a license check.
**Consequences:** The UI never presents 2020 figures as current. Coverage per country and measure is shown on the Trust page.

## ADR-006: Travel advisories as SCD Type 2 on the official warning flags
**Date:** 2026-10-13
**Context:** The German Foreign Office publishes four warning flags per country (travel warning, partial travel warning, situation-specific notice, and the partial version), not a numeric level. Its texts are edited often without the risk status changing. It does not publish advice for Germany, its home country.
**Decision:** A dbt snapshot (check strategy on the four flags) keeps the full history: a new version only when a flag changes, not on text edits. Silver derives an ordinal `advisory_level` 0-4 (our interpretation, always shown next to the official flags). `valid_from`/`valid_to` record when Odyssey observed a status; `effective_at` keeps the issuer's own date. Germany has no advisory rows, and the UI states why instead of implying "safe". An empty or truncated API response (fewer than 150 countries) fails ingestion, so it can never be mistaken for all advisories ending.
**Consequences:** History starts on 2026-10-13 and grows with each daily run. Full advisory texts are shown complete and attributed in Phase 5, never LLM-summarized (ADR-003).

## ADR-007: Exchange rates, holidays and visas
**Date:** 2026-10-13
**Context:** The ECB publishes current reference rates for CHF, ISK, JPY, MXN, NZD, THB and USD, but not NPR, PEN or TZS, and its MAD series ended in 2020. ECB CSVs use CRLF line endings, which Spark's trim does not remove. The passport-index visa data was last published 2025-01-12.
**Decision:**
- FX is ingested incrementally (backfill from 2015 on first run, then a 10-day overlapping window). A currency counts as ECB-covered only if its latest rate is under 14 days old; otherwise it falls back to the World Bank annual rate converted via the ECB USD/EUR average of the same year. Every rate carries its basis and as-of date. CSVs are split on `\r?\n` and columns are located by header name.
- Holidays come from the `holidays` package (national calendars; Swiss cantonal holidays are out of scope), versioned per batch.
- Visa data is pinned to the commit that last changed the file. The UI shows its date and directs travellers to official sources; a warn-level test flags data older than a year.
**Consequences:** All 12 pilot currencies have a rate. Visa information is context, not authority, until a fresher open source exists.

## ADR-008: Scheduled pipelines with dbt inside Databricks
**Date:** 2026-10-13
**Context:** Ingestion and dbt only ran when CI ran, i.e. on code changes. Advisories and exchange rates must refresh daily regardless.
**Decision:** Two bundle jobs replace the three ingestion jobs. `odyssey-daily` (06:00 Europe/Berlin): advisories and FX, then dbt build of everything downstream of those sources (including the SCD2 snapshot), then source freshness. `odyssey-weekly` (Mondays 05:00): all six ingestions, full dbt build, source freshness. dbt runs as a Databricks dbt task on serverless with the profile Databricks generates (catalog and schema from the task; token injected at run time), so no token is stored. dbt only starts once every ingestion task succeeded; failures email the owner. Schedules are paused automatically in dev. CI runs `odyssey-weekly` on PRs (dev) and merges (prod), so the scheduled job itself is what CI tests.
**Consequences:** The platform refreshes without human action. The Phase 1 gate is a permanent test on `mart_country_profile`.

## ADR-009: Places extraction per destination box, bronze via a declarative pipeline
**Date:** 2026-10-13
**Context:** Phase 2 needs places for all pilot destinations from Overture's global dataset, refreshed with each monthly release, inside Free Edition's limits.
**Decision:**
- One bounding box per destination (6 km radius for cities, 15 km for other destinations, longitude span widened by 1/cos(latitude)), extracted with DuckDB into `landing/overture_places/release=/country=/destination=`. Existing files for the current release are skipped, so reruns are free and a new release fills new folders. The full pilot (208 destinations) takes about 8 minutes.
- A serverless Lakeflow Declarative Pipeline (Auto Loader) loads new landing files into `bronze.overture_places` exactly once, with expectations: missing ID or geometry rows are dropped and counted; missing lineage or out-of-range confidence is counted. First load: 3,313,022 rows, 0 dropped, all expectations passed.
- Boxes overlap (e.g. Kathmandu, Lalitpur and Pharping share most of the Kathmandu Valley; 3,085,848 unique places). Silver de-duplicates by Overture ID and attributes each place to its nearest destination within that destination's radius.
**Known limitation:** circles fit cities, not regions. Trekking regions and remote parks have coordinates far from their villages (Annapurna: 46 places; Manu National Park: 0). Region polygons are a later improvement; treks get route data in Phase 3.

## ADR-010: OSM paused; Foursquare added; training labels from exact source links
**Date:** 2026-10-14
**Context:** Public Overpass instances returned 504s and timeouts for all three mirrors, from Databricks and from a private IP alike, so a scheduled pipeline cannot depend on them. OSM's wikidata tags were also rarer than expected (0.3% of named places in Kathmandu). Foursquare OS Places (Apache-2.0, gated on Hugging Face) is spatially clustered in its Parquet files, so per-destination box reads with row-group pruning work.
**Decision:**
- OSM is paused: the Overpass extractor stays in the repo, unscheduled; a future OSM source should use bulk extracts with no live-server dependency.
- Foursquare is extracted per destination box with DuckDB (object cache for file footers; token from the `odyssey` secret scope), excluding the native Parquet GEOMETRY column so Spark can read the files, and loaded by the bronze pipeline.
- Entity-resolution labels come in three layers: exact Overture-to-Foursquare ID links (131,384 in the pilot, 99.9% resolvable), weak supervision (shared phone or website within a short distance, audited against the exact links), and a human-labelled set used only for evaluation.
**Consequences:** Label supply is rich in Japan, Germany and Italy and thin in Nepal, Iceland, Morocco and Tanzania, which is where the human evaluation set concentrates.

## ADR-011: Silver places: one comparable shape, nearest-destination attribution, mapped categories
**Date:** 2026-10-14
**Decision:**
- `silver_places` stacks Overture (latest release) and Foursquare (latest release) into one schema: normalized name (letters/digits in any script), last 9 phone digits, bare website domain, H3 resolution-9 cell, Odyssey category, closed flag, and for Overture the linked Foursquare place ID from its `sources` (exact matching labels).
- Each place is attributed to the nearest destination centre among the boxes that contained it (haversine). Kathmandu Valley example: Pharping's 40,013 boxed places resolve to 1,136; Kathmandu keeps 25,734.
- Categories come from `seeds/category_map.csv`: regex patterns over Overture's taxonomy hierarchy and Foursquare's label path, lowest priority number wins, unmatched = `other`. Overture's newer `taxonomy`/`basic_category` replaced its older `categories` field, so the schema was probed before modelling.
- Databricks SQL is ANSI-strict: out-of-range array access fails, so all optional array reads use `get(array, index)`.
**Consequences:** about 6.66M places in silver; tourism groups (eat/stay/see/do) are what the product shows, while `other` remains available to matching.
