-- Phase 1 gate: every pilot country needs at least 5 destinations.
select c.country_key, count(d.destination_key) as destinations
from {{ ref('dim_country') }} c
left join {{ ref('dim_destination') }} d on d.country_key = c.country_key
group by c.country_key
having count(d.destination_key) < 5
