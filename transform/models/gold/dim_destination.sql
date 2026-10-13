-- Destination dimension: curated by Wikivoyage editors, located and described by Wikidata.
select
    destination_qid                                                       as destination_key,
    country_iso3                                                          as country_key,
    name,
    kind,
    position_in_section                                                   as wikivoyage_rank,
    wikivoyage_title,
    'https://en.wikivoyage.org/wiki/' || replace(wikivoyage_title, ' ', '_') as wikivoyage_url,
    lon,
    lat,
    population,
    population_date,
    sitelinks,
    wikidata_types
from {{ ref('silver_destinations') }}
