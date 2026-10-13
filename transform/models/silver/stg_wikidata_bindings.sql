{{ config(materialized='view') }}
-- One row per SPARQL result binding, from the latest successful response per (query, country).
with ranked as (
    select *,
           row_number() over (partition by query_name, country_iso3 order by _ingested_at desc) as rn
    from {{ source('bronze', 'wikidata_raw') }}
    where http_status = 200
)
select
    query_name,
    country_iso3,
    country_qid,
    _batch_id,
    _ingested_at,
    explode(
        from_json(response_json,
                  'struct<results:struct<bindings:array<map<string,struct<type:string,value:string>>>>>'
        ).results.bindings
    ) as binding
from ranked
where rn = 1
