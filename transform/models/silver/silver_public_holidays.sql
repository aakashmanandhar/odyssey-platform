-- One row per (country, date) from the latest batch per country.
with latest as (
    select *, row_number() over (partition by country_iso3 order by _ingested_at desc) as rn
    from {{ source('bronze', 'holidays_raw') }}
),
parsed as (
    select country_iso3,
           from_json(response_json,
                     'struct<package_version:string,holidays:array<struct<date:string,name:string>>>') as j
    from latest
    where rn = 1
)
select
    country_iso3,
    to_date(h.date)        as holiday_date,
    h.name                 as holiday_name,
    j.package_version      as source_version
from parsed
lateral view explode(j.holidays) t as h
