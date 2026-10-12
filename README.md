# Odyssey: Global Travel Intelligence Platform

A data and AI platform that turns open travel data into explainable recommendations: where to go, when to go, and what to know before you go. Every number is traceable to its source.

**Live:** https://aakashmanandhar.tech/odyssey (coming soon)
**Status:** Phase 1, country backbone (Phase 0 complete)

## Architecture
- **Lakehouse:** Databricks (Unity Catalog, Delta Lake), medallion layers (bronze, silver, gold) with a star schema
- **Ingestion:** DuckDB bounding-box extracts, API extractors, Lakeflow declarative pipelines, streaming via Redpanda
- **Transformation:** dbt with tests and model contracts
- **ML and AI:** MLflow, destination similarity, forecasting, recommendations, grounded RAG assistant and trip-planning agent
- **Serving:** PostgreSQL with PostGIS and pgvector, API layer, React frontend with MapLibre and deck.gl
- **DataOps:** data contracts, CI/CD with GitHub Actions, Terraform, separate dev and prod catalogs, public data-quality page

## Repository layout
| Folder | Purpose |
| --- | --- |
| `config/` | Source registry and pilot countries |
| `contracts/` | Data contracts per source |
| `ingestion/` | Extractors |
| `pipelines/` | Bronze ingestion pipeline |
| `transform/` | dbt project (silver and gold) |
| `ml/` | Features, training, evaluation |
| `serving/api/` | API backend |
| `web/` | Frontend |
| `infra/terraform/` | Infrastructure as code |
| `tests/` | Unit tests |
| `docs/` | Architecture notes |

## Data and attribution
Odyssey uses open data only. Sources, licenses and attribution are listed in `config/` and on the platform's Trust page.

## Author
Designed and developed by **Aakash Manandhar**: [Website](https://aakashmanandhar.tech) · [LinkedIn](https://www.linkedin.com/in/aakashmanandhar/) · [GitHub](https://github.com/aakashmanandhar)
