-- One row per pilot country combining every Phase 1 source: the shape of the country page.
with latest_population as (
    select country_key, max_by(population, year) as population, max(year) as population_year
    from {{ ref('fact_tourism_country_year') }} where population is not null group by country_key
),
latest_price as (
    select country_key, max_by(price_level_ratio, year) as price_level_ratio, max(year) as price_level_year
    from {{ ref('fact_tourism_country_year') }} where price_level_ratio is not null group by country_key
),
baseline_2019 as (
    select country_key, arrivals as arrivals_2019, arrivals_per_resident as arrivals_per_resident_2019
    from {{ ref('fact_tourism_country_year') }} where year = 2019
),
destinations as (
    select country_key, count(*) as destinations,
           sum(case when kind = 'city' then 1 else 0 end) as cities
    from {{ ref('dim_destination') }} group by country_key
),
holidays_this_year as (
    select country_key, count(*) as holidays_this_year
    from {{ ref('fact_public_holiday') }} where year(holiday_date) = year(current_date()) group by country_key
),
current_advisory as (
    select country_key, advisory_level, advisory_label, effective_at as advisory_effective_at
    from {{ ref('fact_advisory') }} where is_current
)
select
    c.country_key,
    c.country_name,
    c.region,
    c.capital,
    c.official_languages,
    p.population,
    p.population_year,
    d.destinations,
    d.cities,
    h.holidays_this_year,
    c.currency_codes[0]                                     as primary_currency,
    cur.rate_per_eur,
    cur.rate_basis,
    cur.rate_as_of,
    pr.price_level_ratio,
    pr.price_level_year,
    b.arrivals_2019,
    b.arrivals_per_resident_2019,
    a.advisory_level,
    coalesce(a.advisory_label,
             case when c.country_key = 'DEU' then 'Not issued: home country of the German Foreign Office' end) as advisory_label,
    a.advisory_effective_at
from {{ ref('dim_country') }} c
left join latest_population p   on p.country_key = c.country_key
left join latest_price pr       on pr.country_key = c.country_key
left join baseline_2019 b       on b.country_key = c.country_key
left join destinations d        on d.country_key = c.country_key
left join holidays_this_year h  on h.country_key = c.country_key
left join current_advisory a    on a.country_key = c.country_key
left join {{ ref('dim_currency') }} cur on cur.currency_key = c.currency_codes[0]
