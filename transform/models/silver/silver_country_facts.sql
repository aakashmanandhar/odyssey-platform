-- One row per country: folds the SPARQL fan-out (one row per language x currency) back together.
select
    country_iso3,
    country_qid,
    array_join(array_sort(collect_set(binding['capitalLabel'].value)), ' / ')        as capital,
    max(cast(binding['population'].value as bigint))                                   as population,
    max(cast(binding['area'].value as double))                                         as area_km2,
    array_sort(collect_set(binding['currencyCode'].value))                             as currency_codes,
    array_sort(collect_set(binding['languageLabel'].value))                            as official_languages,
    max(cast(regexp_extract(binding['coord'].value, '^Point\\(([-0-9.eE]+) ', 1) as double)) as lon,
    max(cast(regexp_extract(binding['coord'].value, ' ([-0-9.eE]+)\\)$', 1) as double))      as lat,
    max(_ingested_at)                                                                  as _ingested_at
from {{ ref('stg_wikidata_bindings') }}
where query_name = 'country_facts'
group by country_iso3, country_qid
