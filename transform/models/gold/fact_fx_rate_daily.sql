-- ECB daily reference rates: units of currency per 1 EUR.
select
    currency || '-' || cast(rate_date as string)        as currency_date_key,
    currency                                             as currency_key,
    cast(date_format(rate_date, 'yyyyMMdd') as int)      as date_key,
    rate_date,
    rate_per_eur,
    'ECB euro reference rate'                            as rate_basis
from {{ ref('silver_ecb_rates') }}
