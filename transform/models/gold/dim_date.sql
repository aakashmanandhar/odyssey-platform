-- One row per day, 2000-01-01 to 2030-12-31: covers World Bank history (pageviews start 2015-07-01).
with days as (
    select explode(sequence(to_date('2000-01-01'), to_date('2030-12-31'), interval 1 day)) as date_day
)
select
    cast(date_format(date_day, 'yyyyMMdd') as int) as date_key,
    date_day,
    year(date_day)                  as year,
    quarter(date_day)               as quarter,
    month(date_day)                 as month,
    date_format(date_day, 'MMMM')   as month_name,
    day(date_day)                   as day_of_month,
    dayofweek(date_day)             as day_of_week,      -- 1 = Sunday, 7 = Saturday
    date_format(date_day, 'EEEE')   as day_name,
    weekofyear(date_day)            as iso_week,
    dayofweek(date_day) in (1, 7)   as is_weekend
from days
