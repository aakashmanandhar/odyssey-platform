-- Visa requirement for every passport travelling to a pilot country.
select
    v.passport_iso3 || '-' || v.destination_iso3   as passport_destination_key,
    v.passport_iso3,
    v.destination_iso3                             as destination_country_key,
    v.requirement_category,
    v.visa_free_days,
    v.requirement_raw,
    v.data_published_at,
    v.source_version
from {{ ref('silver_visa_requirements') }} v
join {{ ref('dim_country') }} c on c.country_key = v.destination_iso3
