{{ config(materialized='view') }}
-- Latest Overture release; one row per place, attributed to the nearest destination whose box contained it.
with latest as (
    select * from {{ source('bronze', 'overture_places') }}
    where _source_release = (select max(_source_release) from {{ source('bronze', 'overture_places') }})
),
candidates as (
    select
        o.id                                                    as source_place_id,
        o.names.primary                                         as name,
        (o.bbox.ymin + o.bbox.ymax) / 2                         as lat,
        (o.bbox.xmin + o.bbox.xmax) / 2                         as lon,
        get(o.phones, 0)                                             as phone,
        get(o.websites, 0)                                           as website,
        concat_ws('>', o.taxonomy.hierarchy)                    as category_path,
        o.operating_status = 'permanently_closed'               as is_closed,
        o.confidence,
        get(transform(filter(o.sources, s -> s.dataset = 'Foursquare'), s -> s.record_id), 0) as linked_fsq_place_id,
        o._destination_key                                      as destination_key,
        o._country_iso3                                         as country_iso3,
        o._source_release                                       as source_release,
        d.lat                                                   as destination_lat,
        d.lon                                                   as destination_lon
    from latest o
    join {{ ref('silver_destinations') }} d on d.destination_qid = o._destination_key
)
select * except (destination_lat, destination_lon),
       {{ haversine_km('destination_lat', 'destination_lon', 'lat', 'lon') }} as distance_km
from candidates
qualify row_number() over (partition by source_place_id
                           order by {{ haversine_km('destination_lat', 'destination_lon', 'lat', 'lon') }}) = 1
