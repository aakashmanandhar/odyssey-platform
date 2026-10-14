-- Unified places from all sources, comparable for matching: normalized name/phone/website, H3 cell, Odyssey category.
with places as (
    select 'overture' as source, * from {{ ref('stg_overture_places') }}
    union all
    select 'foursquare' as source, * from {{ ref('stg_foursquare_places') }}
),
categorized as (
    select p.source, p.source_place_id, m.odyssey_category,
           row_number() over (partition by p.source, p.source_place_id order by m.priority) as rn
    from places p
    join {{ ref('category_map') }} m on m.source = p.source and p.category_path rlike m.pattern
)
select
    p.source || ':' || p.source_place_id                                                   as place_source_key,
    p.source,
    p.source_place_id,
    p.name,
    trim(regexp_replace(lower(p.name), '[^\\p{L}\\p{N} ]', ''))                           as name_normalized,
    p.lat,
    p.lon,
    h3_longlatash3(p.lon, p.lat, 9)                                                        as h3_r9,
    nullif(right(regexp_replace(p.phone, '[^0-9]', ''), 9), '')                            as phone_normalized,
    nullif(regexp_extract(lower(p.website), '^(?:https?://)?(?:www\\.)?([^/:?#]+)', 1), '') as website_domain,
    p.category_path,
    coalesce(c.odyssey_category, 'other')                                                  as odyssey_category,
    p.is_closed,
    p.confidence,
    p.linked_fsq_place_id,
    p.destination_key,
    p.country_iso3,
    round(p.distance_km, 3)                                                                as distance_km,
    p.source_release
from places p
left join categorized c on c.source = p.source and c.source_place_id = p.source_place_id and c.rn = 1
where p.lat is not null and p.lon is not null
