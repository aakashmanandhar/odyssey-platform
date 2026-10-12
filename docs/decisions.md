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
