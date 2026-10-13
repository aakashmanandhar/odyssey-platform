-- Every pilot country needs national holidays for the current year (Switzerland has only a few nationally).
select c.country_key, count(h.country_holiday_key) as holidays_this_year
from {{ ref('dim_country') }} c
left join {{ ref('fact_public_holiday') }} h
    on h.country_key = c.country_key and year(h.holiday_date) = year(current_date())
group by c.country_key
having count(h.country_holiday_key) < 3
