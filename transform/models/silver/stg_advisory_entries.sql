{{ config(materialized='view') }}
-- One row per country entry in the latest advisory list. Response keys are numeric content IDs.
with latest as (
    select *, row_number() over (order by _ingested_at desc) as rn
    from {{ source('bronze', 'advisories_raw') }}
    where http_status = 200
),
entries as (
    select explode(from_json(get_json_object(response_json, '$.response'), 'map<string,string>')) as (content_id, entry_json),
           _ingested_at
    from latest
    where rn = 1
)
select
    content_id,
    from_json(entry_json,
      'struct<lastModified:bigint,effective:bigint,title:string,countryCode:string,iso3CountryCode:string,
              countryName:string,warning:boolean,partialWarning:boolean,situationWarning:boolean,situationPartWarning:boolean>') as e,
    _ingested_at
from entries
where content_id rlike '^[0-9]+$'
