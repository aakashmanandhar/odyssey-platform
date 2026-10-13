-- Sanity range for well-known currencies: catches inverted rates (EUR per unit instead of units per EUR).
select currency_key, rate_per_eur
from {{ ref('dim_currency') }}
where (currency_key = 'USD' and rate_per_eur not between 0.7 and 1.6)
   or (currency_key = 'CHF' and rate_per_eur not between 0.7 and 1.3)
   or (currency_key = 'JPY' and rate_per_eur not between 80 and 300)
