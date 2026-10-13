-- Grain: one country in one year. World Bank values plus derived tourism metrics.
with pivoted as (
    select
        country_iso3,
        year,
        max(case when indicator_id = 'ST.INT.ARVL'    then value end) as arrivals,
        max(case when indicator_id = 'ST.INT.RCPT.CD' then value end) as receipts_usd,
        max(case when indicator_id = 'SP.POP.TOTL'    then value end) as population,
        max(case when indicator_id = 'PA.NUS.PPP'     then value end) as ppp_factor,
        max(case when indicator_id = 'PA.NUS.FCRF'    then value end) as exchange_rate
    from {{ ref('silver_worldbank_indicators') }}
    group by country_iso3, year
)
select
    country_iso3 || '-' || cast(year as string)           as country_year_key,
    country_iso3                                           as country_key,
    year,
    cast(year * 10000 + 101 as int)                        as year_start_date_key,
    cast(arrivals as bigint)                               as arrivals,
    receipts_usd,
    cast(population as bigint)                             as population,
    ppp_factor,
    exchange_rate,
    round(try_divide(ppp_factor, exchange_rate), 4)        as price_level_ratio,
    round(try_divide(arrivals, population), 4)             as arrivals_per_resident,
    round(try_divide(receipts_usd, arrivals), 2)           as receipts_per_arrival_usd,
    year in (2020, 2021)                                   as is_pandemic_year
from pivoted
