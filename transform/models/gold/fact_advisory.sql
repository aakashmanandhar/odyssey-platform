-- Advisory history (SCD2) for pilot countries. One row per advisory version.
-- valid_from/valid_to: when Odyssey observed this status. effective_at: the issuer's own date.
-- Germany has no rows: the German Foreign Office does not issue advice for its home country.
select
    s.dbt_scd_id                                     as advisory_version_key,
    s.country_iso3                                   as country_key,
    'Auswärtiges Amt (German Federal Foreign Office)' as issuer,
    s.advisory_level,
    s.advisory_label,
    s.warning,
    s.partial_warning,
    s.situation_warning,
    s.situation_part_warning,
    s.official_title,
    s.effective_at,
    s.source_last_modified_at,
    s.dbt_valid_from                                 as valid_from,
    s.dbt_valid_to                                   as valid_to,
    s.dbt_valid_to is null                           as is_current,
    'https://www.auswaertiges-amt.de/opendata/travelwarning/' || s.content_id as source_api_url
from {{ ref('snap_advisories') }} s
join {{ ref('dim_country') }} c on c.country_key = s.country_iso3
