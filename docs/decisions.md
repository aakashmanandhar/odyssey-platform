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
