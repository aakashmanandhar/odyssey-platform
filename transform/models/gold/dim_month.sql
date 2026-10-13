-- The 12 calendar months. Seasons are meteorological; tropical and monsoon climates
-- are handled later with real climate data, not by these labels.
with months as (
    select explode(sequence(1, 12)) as month
)
select
    month,
    date_format(make_date(2000, month, 1), 'MMMM') as month_name,
    date_format(make_date(2000, month, 1), 'MMM')  as month_short,
    cast(ceil(month / 3) as int)                    as quarter,
    case when month in (12, 1, 2) then 'winter' when month in (3, 4, 5) then 'spring'
         when month in (6, 7, 8) then 'summer' else 'autumn' end as season_north,
    case when month in (12, 1, 2) then 'summer' when month in (3, 4, 5) then 'autumn'
         when month in (6, 7, 8) then 'winter' else 'spring' end as season_south
from months
