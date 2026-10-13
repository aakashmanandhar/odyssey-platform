-- Current advisory per country with the official flags and a derived ordinal level (our interpretation, see docs).
select
    e.iso3CountryCode                           as country_iso3,
    e.countryCode                               as iso2,
    e.countryName                               as country_name_de,
    e.title                                     as official_title,
    content_id,
    coalesce(e.warning, false)                  as warning,
    coalesce(e.partialWarning, false)           as partial_warning,
    coalesce(e.situationWarning, false)         as situation_warning,
    coalesce(e.situationPartWarning, false)     as situation_part_warning,
    case when e.warning then 4 when e.partialWarning then 3 when e.situationWarning then 2
         when e.situationPartWarning then 1 else 0 end                                   as advisory_level,
    case when e.warning then 'Travel warning'
         when e.partialWarning then 'Partial travel warning'
         when e.situationWarning then 'Situation-specific safety notice'
         when e.situationPartWarning then 'Situation-specific notice for parts of the country'
         else 'No warning (standard travel and safety advice)' end                       as advisory_label,
    timestamp_seconds(e.effective)              as effective_at,
    timestamp_seconds(e.lastModified)           as source_last_modified_at,
    _ingested_at
from {{ ref('stg_advisory_entries') }}
where e.iso3CountryCode is not null
