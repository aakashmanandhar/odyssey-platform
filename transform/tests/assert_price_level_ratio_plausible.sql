-- A price level ratio outside 0.1 to 3 means a unit or currency mix-up, not a real price level.
select country_key, year, price_level_ratio
from {{ ref('fact_tourism_country_year') }}
where price_level_ratio is not null and price_level_ratio not between 0.1 and 3
