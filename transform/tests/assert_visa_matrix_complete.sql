-- Every pilot destination needs requirements for at least 150 passports.
select c.country_key, count(v.passport_destination_key) as passports
from {{ ref('dim_country') }} c
left join {{ ref('fact_visa_requirement') }} v on v.destination_country_key = c.country_key
group by c.country_key
having count(v.passport_destination_key) < 150
