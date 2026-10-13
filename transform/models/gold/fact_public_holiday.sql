-- National public holidays per pilot country (holidays package; cantonal/regional holidays not included).
select
    country_iso3 || '-' || cast(holiday_date as string)   as country_holiday_key,
    country_iso3                                           as country_key,
    cast(date_format(holiday_date, 'yyyyMMdd') as int)     as date_key,
    holiday_date,
    holiday_name,
    source_version
from {{ ref('silver_public_holidays') }}
