{{ config(materialized='view') }}
-- One row per (indicator, country, year) from the latest successful response per indicator.
with latest as (
    select *, row_number() over (partition by query_name order by _ingested_at desc) as rn
    from {{ source('bronze', 'worldbank_raw') }}
    where http_status = 200
)
select
    query_name               as indicator_id,
    r.countryiso3code        as country_iso3,
    cast(r.date as int)      as year,
    r.value,
    r.obs_status,
    _ingested_at
from latest
lateral view explode(
    from_json(get_json_object(response_json, '$[1]'),
              'array<struct<countryiso3code:string,date:string,value:double,obs_status:string>>')
) t as r
where rn = 1
