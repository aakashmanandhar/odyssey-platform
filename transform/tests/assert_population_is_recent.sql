-- Every pilot country needs a population figure from the last 4 years (per-capita metrics depend on it).
select c.country_key, max(f.year) as latest_population_year
from {{ ref('dim_country') }} c
left join {{ ref('fact_tourism_country_year') }} f
    on f.country_key = c.country_key and f.population is not null
group by c.country_key
having max(f.year) is null or max(f.year) < year(current_date()) - 4
