-- Every pilot country except Germany (the issuer's home country) has exactly one current advisory.
select c.country_key, count(a.advisory_version_key) as current_versions
from {{ ref('dim_country') }} c
left join {{ ref('fact_advisory') }} a on a.country_key = c.country_key and a.is_current
where c.country_key <> 'DEU'
group by c.country_key
having count(a.advisory_version_key) <> 1
