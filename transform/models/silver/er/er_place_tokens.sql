-- Places prepared for matching: resolution-10 H3 cell and the distinct character trigrams of the name.
-- Overture records copied from Foursquare are excluded: they are resolved deterministically by their source link.
with places as (
    select *, regexp_replace(name_normalized, ' ', '') as name_compact
    from {{ ref('silver_places') }}
    where name_normalized is not null and name_normalized <> ''
      and not (source = 'overture' and linked_fsq_place_id is not null)
      {% if var('er_country', none) %} and country_iso3 = '{{ var("er_country") }}' {% endif %}
)
select
    place_source_key, source, country_iso3, lat, lon, phone_normalized, website_domain, odyssey_category,
    h3_longlatash3(lon, lat, 10) as h3_r10,
    case when length(name_compact) < 3 then array(name_compact)
         else array_distinct(transform(sequence(1, length(name_compact) - 2), i -> substr(name_compact, i, 3)))
    end as trigrams
from places
