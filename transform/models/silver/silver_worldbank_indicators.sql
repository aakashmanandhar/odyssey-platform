-- Non-empty World Bank values, one row per (indicator, country, year).
select
    indicator_id || '-' || country_iso3 || '-' || cast(year as string) as indicator_country_year_key,
    indicator_id,
    country_iso3,
    year,
    value,
    _ingested_at
from {{ ref('stg_worldbank_records') }}
where value is not null
