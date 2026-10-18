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

## ADR-012: Entity resolution: two-key blocking, phone-derived labels without leakage, gradient-boosted matcher
**Date:** 2026-10-14
**Findings that shaped the design:**
- Overture records sourced from Foursquare are near-copies (median 0.4 m apart, 99.5% identical names), so these 131k exact links are resolved deterministically and are useless as training labels for independent records.
- A shared phone alone is not a match: 78% of same-phone pairs are over 1 km apart (chains, hotlines), and close same-phone pairs include shared switchboards (a hotel and its restaurant, doctors in one building).
- Independently recorded matches lie within 100 m about 94% of the time; only 50% have identical names.
- Location-only blocking (H3 r10 ring, 150 m) yields about 485M pairs (151M in Japan alone).
**Decision:**
- Blocking requires proximity (H3 r10 + ring, <= 150 m) and evidence: a shared rare name trigram (trigrams in more than 0.5% of a country's names are ignored), a shared phone or a shared domain. About 3.16M pairs (150x fewer), built in about 2 minutes.
- Labels use phones only: a phone unique to one place per source, shared within 100 m, is a match; every other candidate of a matched place is a non-match (one place matches at most one record per source). This replaced "two different phones = non-match", which proved 11% noisy (same business, different numbers).
- The model (HistGradientBoosting) never sees phone features (enforced by an assert). The split is by destination (60/20/20) and the threshold is precision-first (>= 97% on validation). Tracked in MLflow and registered as `<catalog>.ml.place_matcher` (alias `champion`).
**Results (unseen destinations, v1):** precision 0.961, recall 0.969, PR-AUC 0.995, recall on different-name matches 0.875.
**Limitations:** weak labels over-represent businesses with phones; a human-labelled evaluation set is still needed. 115k Overture places have more than one accepted partner, which the next step (one-to-one clustering) resolves.

## ADR-013: Golden places: mutual-best clustering, persistent ID registry, deterministic survivorship
**Date:** 2026-10-14
**Decision:**
- A model-accepted pair is kept only if each side is the other's best-scoring partner (mutual best, one-to-one); other accepted pairs are held for human review. Clusters = a Foursquare place plus the Overture records linked to it by an exact copy link or a mutual-best model match; unlinked records are single-source golden places.
- Odyssey place IDs live in an incremental registry (`place_id_registry`) that never deletes: clusters reuse their members' existing ID (smallest wins), the larger side of a split keeps it, new clusters get `odp_` + a SHA-256 prefix of their anchor (split losers hash anchor + lost ID, so no collisions).
- Survivorship per attribute, deterministic via a weighted `max(named_struct(...))` macro: name and coordinates Foursquare-first; a real category beats `other`; phone and website from any source that has one; closed if any source says permanently closed. Each golden place keeps its sources, record keys, all names, match type and score.
- The weekly job runs ingest -> dbt (excluding `tag:after_ml`) -> train and score -> dbt (`tag:after_ml`).
**Result (dev):** 6,661,512 source records -> 5,423,286 golden places; a rebuild kept 100% of IDs.

## ADR-014: Human-labelled evaluation set for entity resolution
**Date:** 2026-10-15
**Context:** The matcher's published metrics come from weak, phone-derived labels, which over-represent businesses that list a phone. Portfolio visitors and the Trust page need a number grounded in human judgement.
**Decision:**
- `er_eval_sample` draws 300 pairs in five strata: merged matches (90), matches held back by one-to-one clustering (45), near misses scoring >= 0.2 (60), rejected pairs with similar names (45) and Nepal (60). Ordering is by `xxhash64(pair_key)`, so the draw is reproducible.
- Pairs are labelled blind (model score and stratum hidden) as same / different / not sure in a small private labelling page.
- Labels are committed as the seed `er_human_labels`, keyed by `pair_key`, carrying the v1 stratum and stratum population. Every model version is re-scored against the same judgements, and metrics are weighted by stratum population to estimate whole-population precision and recall.
- "Not sure" is reported separately and excluded from precision and recall.
**Consequences:** 300 labels give roughly ±5-10 point confidence intervals per stratum; the Nepal stratum is reported on its own. The set can grow later (v2) without invalidating v1 labels.

## ADR-015: Destination photos from Wikimedia Commons, licence-checked in the pipeline
**Date:** 2026-10-16
**Context:** The app needs a photo for every destination, legally reusable and credited. Stock APIs were compared: Unsplash (attribution and hotlinking required, 50 requests/hour until approved), Pexels (new API keys paused since October 2026), Pixabay (no permanent hotlinking). Wikimedia Commons needs no key, covers almost every destination and carries the licence with every file.
**Decision:**
- Weekly job `ingest_images`: the Wikidata main image (P18) and Wikivoyage banner (P948) for every destination, then Commons imageinfo (author, licence, 1600 px URL) in batches of 50, with 1-second pauses and an identifying User-Agent. Responses are stored raw in `bronze.images_raw`; the job fails without writing if fewer than half the destinations have a photo.
- dbt parses the latest batch and allows only CC0, public domain, CC BY and CC BY-SA. NonCommercial, NoDerivatives and GFDL files are excluded. Every row carries a ready-made credit line.
- Gold `dim_destination_image`: one photo per destination and role (main, banner), landscape and larger files preferred; `is_hero` marks the card and header photo.
- The web app (Phase 5) will cache resized copies on our own server instead of hotlinking Commons.
**Result (first run):** 206 of 208 destinations have a hero photo and 201 a banner; 6 GFDL files excluded.
**Later:** photos for individual places (from Wikidata IDs in Overture/Foursquare), with Unsplash as an optional fallback for gaps.

## ADR-016: Notable places and their photos from Wikipedia geosearch, matched to golden places
**Date:** 2026-10-16
**Context:** Overture and Foursquare do not link landmarks to Wikidata, so famous places had no photo or notability signal. A first design using Wikidata SPARQL (radius search per destination) timed out and was rate-limited in dense cities (25 of 208 destinations after 40 minutes; HTTP 429). Wikidata's query service gives each client about 60 seconds of query time per minute.
**Decision:**
- Weekly job `ingest_notable_places` uses Wikipedia's geosearch API instead: the nearest 200 articles per destination (6 km for cities, 10 km otherwise) with coordinates and their type, free lead photo, Wikidata ID, 30-day page views and local-language title; then Commons imageinfo for the photos (batches limited to 50 files and ~7,000 URL characters, because percent-encoded non-Latin names exceed URL limits). Partial failures are tolerated up to 20% of destinations and 5% of Commons batches. About 3-15 minutes per run.
- Articles about areas (coordinate types city, adm*, country, isle, event, or a title equal to a destination name) are kept in silver but never matched: they matched businesses named after the city ("Pokhara" to "Cafe pokhara").
- Matching to golden places: H3 resolution 10 with two rings (within 250 m), best character-trigram similarity over all place names against English and local titles, a containment rule with a length-ratio guard, then one-to-one mutual-best selection.
- Gold `dim_place_wiki`: matched places with Wikipedia title, Wikidata ID, 30-day views and rank in destination, and an openly licensed photo with a credit line where available. Tests: one row per place and per article, valid place, no photo without credit.
**Result (dev):** 11,000+ articles; 42-85% of eligible articles matched per country; about 6,000 places with a photo (Nepal: Pashupatinath, Swayambhunath, Boudha, the three Durbar Squares, Phewa Lake, all within 0.6-230 m).
**Later:** unmatched landmark articles (no Overture/Foursquare record) can become new golden places; the human evaluation set can be extended to these matches.

## ADR-017: Destination highlights ("must-see") from Wikipedia popularity, with grid search and editorial overrides
**Date:** 2026-10-17
**Context:** A first version searched the 200 articles nearest each destination centre. In dense cities that covers about 1 km (Rome's list started with Trajan's Column; the Colosseum, Pantheon and Trevi Fountain were missing).
**Decision:**
- Ingest: cities are searched on a 19-point grid of 3 km circles (500 articles each), other destinations with one 10 km circle; article details are fetched once per article in batches of 50. About 30-45 minutes, so the job moved from the weekly to the monthly pipeline.
- `mart_destination_highlights`: top 30 per destination. Score = log10(1 + 30-day page views) + 0.3 with a usable photo + 0.2 when both place sources confirm the place. Built from all eligible articles, so famous places missing from Overture/Foursquare still appear (`is_in_place_index` = false). An article is listed under every destination whose search area found it (Kathmandu, Lalitpur and Bhaktapur overlap).
- Eligibility: no area articles; no railway stations, education, airports; whole-word title rules for institutions and events; unmatched articles must be a typed physical feature; matched places must be sights/activities or landmarks.
- Matching rule added: a landmark article never matches a restaurant, hotel or shop (Fushimi Inari had matched a cafe at its gate).
- Editorial overrides: seed `highlight_overrides` (title, action, reason) excludes what rules cannot see (organisations headquartered in landmark buildings, a historic capital, a stadium). Each change is a reviewed one-line commit.
**Result (dev):** 189 destinations, 2,793 highlights, 91% with photos. Rome: Colosseum, Pantheon, St. Peter's, Trevi Fountain; Kyoto: Kiyomizu-dera, Fushimi Inari, Kinkaku-ji; Kathmandu: Pashupatinath, Swayambhunath, Boudha, the Durbar Squares.
**Later:** blend in place-level signals (Foursquare popularity when available, review counts) and the season; a `pin` action for editorial picks.

## ADR-018: "When to go" climate from WorldClim (temperature, rain) and NASA POWER (humidity, cloud, sun, wind)
**Date:** 2026-10-17
**Context:** NASA POWER's climatology API (2001-2025, one request per destination) has a ~50 km grid. In mountain valleys it was badly wrong: Kathmandu's April high came out at 35.4 C (actual about 28 C) although NASA's grid cell averages 1,269 m, so the error is the model's handling of complex terrain, not elevation alone. Open-Meteo's historical API counts multi-year daily requests as hundreds of calls each, beyond the free daily limit for 208 destinations.
**Decision:**
- Temperature (daily high, low) and rainfall: WorldClim 2.1 monthly normals (1970-2000, 2.5 arc-minutes ~4.5 km, interpolated from stations with elevation as a covariate; Fick & Hijmans 2017; free for non-commercial use with citation). Zips are downloaded once into the landing volume; each destination is sampled from the 12 monthly GeoTIFFs with rasterio into `bronze.climate_worldclim_raw`. NASA values are the fallback where WorldClim has no data (points over sea); `temp_rain_source` records which was used.
- Humidity, cloud, sunshine, wind: NASA POWER (2001-2025), adequate at regional scale.
- Gold `fact_destination_climate_month`: 12 rows per destination. Comfort score 0-100 = 100 x (0.50 temperature + 0.35 rain + 0.15 cloud): average high 18-28 C ideal (0 at 5 C / 38 C), rain <= 30 mm/month ideal (0 at 300 mm), cloud <= 30% ideal (0 at 85%). The score is absolute (compare destinations); the season label is relative to each destination's best month (best within 10 points, good within 25) so hot places still get a best season. The 3 top months are flagged.
- Scheduled in the weekly job: the gold model is built there, and the run is cheap once WorldClim is cached.
**Result:** Kathmandu April high 27.4 C (NASA 35.4 C); monsoon months off-season; Bangkok best December-February (peak score 76 vs Rome 100); southern-hemisphere and high-altitude seasons correct.
**Limitations:** WorldClim's 1970-2000 period predates recent warming (roughly +1 C); seasonal shape and comparisons are unaffected. Comfort ignores night cold and humidity for now.

## ADR-019: Entity-resolution evaluation v1, labelled by an AI reviewer
**Date:** 2026-10-17
**Context:** The matcher's published metrics (precision 0.961, recall 0.969) come from phone-derived weak labels, which favour businesses that list a phone. ADR-014 defined a 300-pair stratified sample for independent judgement.
**Decision:**
- All 300 pairs were labelled same / different / unsure by an AI reviewer (Claude), not by a human, from names, categories, websites and distances, under written rules. Same: one real-world place, including a doctor and their own practice, a faculty and its main building, one name in two scripts, small spelling variants. Different: part vs whole (a hotel's gym or taxi stand, an auditorium in a school, a restaurant in a market or temple area), neighbouring businesses, different people at one address, roads and squares. Unsure when the data cannot settle it (24 pairs, excluded from rates; web searches on the most promising ones were inconclusive). A second review pass changed no labels.
- Labels are the seed `er_eval_labels` (labeller recorded per row); `er_eval_metrics` computes the figures in the warehouse.
**Result (v1):** precision of merges 0.897 (95% CI 0.815-0.945, 87 judged pairs); precision of all accepts 0.886 (population-weighted); recall upper bound 0.898. Nepal: 23 of 24 predicted matches correct; 6 of 35 rejections were real matches.
**Findings:** errors accepted: neighbouring businesses at one address, chain branches. Errors rejected: the same place in two scripts, small spelling variants; the near-miss stratum (score >= 0.2) is 69% true matches, so the 0.47 threshold is likely too strict.
**Limitations:** AI judgements may differ from a careful local human on a few percent of pairs (chain branches, rebrands); a 30-pair human agreement check is planned. Recall is an upper bound because dissimilar-name rejections (e.g. different scripts) were not sampled.
**Next:** script-aware name features (transliteration), an "address shared by several businesses" feature, threshold re-tuning against these labels, champion/challenger evaluation of future model versions on the same set.

## ADR-020: Classify highlights by Wikidata type, not by title words

**Status:** accepted (2026-10-18)

**Context.** Highlights come from Wikipedia articles near each destination. Title and coordinate-type rules removed
obvious non-sights, but a full read-through of every destination's top 3 still found companies (Novartis, Cemex),
sports venues and clubs (San Siro, FC Bayern Munich), events (Oktoberfest, Spengler Cup), organisations (FIFA,
dioceses), towns listed as sights of a city, places across a border (San Diego under Tijuana) and red-light areas.
None of these share reliable title words.

**Decision.** Fetch each article's Wikidata types (P31), countries (P17) and the full superclass chain of every type
(P279*) in a weekly bronze ingest (`ingest_wikidata_types`). A reviewed seed, `wikidata_class_rules`, maps a small set
of Wikidata classes to a rule: `exclude` (always), `soft_exclude` (unless also a recognised sight), `settlement`
(allowed on region pages only) and `include` (recognised sight). `silver_wikidata_place_class` turns that into flags per
item; `mart_destination_highlights` applies them and requires the item's country, when known, to match the
destination's. Every class ID in the seed was checked against Wikidata's own English label before use.

**Consequences.** The policy is data, reviewable in one CSV, and covers subclasses automatically (a football stadium is
excluded because it is a sports venue). Items Wikidata does not classify are kept, so nothing legitimate disappears for
lack of data. Title rules and manual overrides remain as a second safety net. A dbt test fails the build if any
highlight's type is excluded.

**Refinement (same day, after a dev read-through).** Wikidata attaches broad classes to real sights (museums inherit
"business", the Colosseum "sports venue", Jemaa el-Fnaa "planned event"), so only classes that are never a sight stay a
hard `exclude` (sports clubs and competitions, disasters, battles, expeditions, red-light districts, border crossings,
nightclubs, military bases, convention centres); the rest are `soft_exclude`, i.e. dropped only when the item is not also
a recognised sight. Towns are allowed on region pages. The country check applies to cities only and accepts enclaves
and historical states listed in seed `country_qid_aliases` (Vatican City, East Germany, Holy Roman Empire, ...).
Famous sights that Wikidata types poorly (The Last Supper as a painting, Galleria Vittorio Emanuele II as a shopping
centre) are kept through an explicit, reasoned `keep` row in seed `highlight_overrides`. Verified against every
destination's top 3: 102 non-sights removed, no known sight lost; 7 destinations whose only candidates were non-sights
now honestly show none.
