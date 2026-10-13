-- Every currency Odyssey needs, with its latest rate per EUR and how that rate was obtained.
-- ECB daily if the series is current (latest rate < 14 days old); otherwise World Bank annual average via USD.
with needed as (
    select distinct currency_key, country_key
    from (select explode(currency_codes) as currency_key, country_key from {{ ref('dim_country') }})
    union all select 'EUR', cast(null as string)
    union all select 'USD', cast(null as string)
),
ecb_latest as (
    select currency as currency_key, max_by(rate_per_eur, rate_date) as rate_per_eur, max(rate_date) as rate_date
    from {{ ref('silver_ecb_rates') }}
    group by currency
),
wb_latest as (
    select country_key, max_by(exchange_rate, year) as lcu_per_usd, max(year) as year
    from {{ ref('fact_tourism_country_year') }}
    where exchange_rate is not null
    group by country_key
),
usd_per_eur_by_year as (
    select year(rate_date) as year, avg(rate_per_eur) as usd_per_eur
    from {{ ref('silver_ecb_rates') }}
    where currency = 'USD'
    group by year(rate_date)
),
resolved as (
    select
        n.currency_key,
        case
            when n.currency_key = 'EUR' then 1.0
            when e.rate_date >= date_sub(current_date(), 14) then e.rate_per_eur
            else w.lcu_per_usd * u.usd_per_eur
        end as rate_per_eur,
        case
            when n.currency_key = 'EUR' then current_date()
            when e.rate_date >= date_sub(current_date(), 14) then e.rate_date
            else make_date(w.year, 1, 1)
        end as rate_as_of,
        case
            when n.currency_key = 'EUR' then 'Base currency'
            when e.rate_date >= date_sub(current_date(), 14) then 'ECB euro reference rate (daily)'
            else 'World Bank official rate, annual average, converted via ECB USD/EUR'
        end as rate_basis,
        e.rate_date as ecb_last_published
    from needed n
    left join ecb_latest e on e.currency_key = n.currency_key
    left join wb_latest w on w.country_key = n.country_key
    left join usd_per_eur_by_year u on u.year = w.year
)
select
    currency_key,
    round(rate_per_eur, 6)                          as rate_per_eur,
    rate_as_of,
    rate_basis,
    rate_basis = 'ECB euro reference rate (daily)'  as is_daily,
    ecb_last_published
from resolved
qualify row_number() over (partition by currency_key order by rate_as_of desc nulls last) = 1
