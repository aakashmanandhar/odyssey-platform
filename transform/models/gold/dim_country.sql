-- Country dimension: pilot config (codes, region, focus) + Wikidata facts.
select
    p.iso3                   as country_key,
    p.iso2,
    p.iso3,
    p.wikidata_id,
    p.country_name,
    p.region,
    split(p.focus, ';')      as focus,
    f.capital,
    f.population,
    f.area_km2,
    f.currency_codes,
    f.official_languages,
    f.lon,
    f.lat,
    f._ingested_at           as facts_ingested_at
from {{ ref('pilot_countries') }} p
left join {{ ref('silver_country_facts') }} f
    on f.country_iso3 = p.iso3
