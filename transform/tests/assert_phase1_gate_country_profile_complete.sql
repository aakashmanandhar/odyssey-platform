-- Phase 1 gate: every pilot country has a complete profile across all Phase 1 sources.
select country_key
from {{ ref('mart_country_profile') }}
where population is null or destinations < 5 or holidays_this_year < 3
   or rate_per_eur is null or price_level_ratio is null or arrivals_2019 is null
   or advisory_label is null
