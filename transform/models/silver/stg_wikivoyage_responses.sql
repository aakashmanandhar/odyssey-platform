{{ config(materialized='view') }}
-- Latest successful Wikivoyage response per (query, country).
select query_name, country_iso3, response_json, _ingested_at
from (
    select *, row_number() over (partition by query_name, country_iso3 order by _ingested_at desc) as rn
    from {{ source('bronze', 'wikivoyage_raw') }}
    where http_status = 200
)
where rn = 1
