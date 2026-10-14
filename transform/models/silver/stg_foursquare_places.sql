{{ config(materialized='view') }}
-- Latest Foursquare release; one row per place, attributed to the nearest destination whose box contained it.
with latest as (
    select * from {{ source('bronze', 'foursquare_places') }}
    where _source_release = (select max(_source_release) from {{ source('bronze', 'foursquare_places') }})
),
candidates as (
    select
        f.fsq_place_id                                          as source_place_id,
        f.name,
        f.latitude                                              as lat,
        f.longitude                                             as lon,
        f.tel                                                   as phone,
        f.website,
        get(f.fsq_category_labels, 0)                                as category_path,
        f.date_closed is not null                               as is_closed,
        cast(null as double)                                    as confidence,
        cast(null as string)                                    as linked_fsq_place_id,
        f._destination_key                                      as destination_key,
        f._country_iso3                                         as country_iso3,
        f._source_release                                       as source_release,
        d.lat                                                   as destination_lat,
        d.lon                                                   as destination_lon
    from latest f
    join {{ ref('silver_destinations') }} d on d.destination_qid = f._destination_key
)
select * except (destination_lat, destination_lon),
       {{ haversine_km('destination_lat', 'destination_lon', 'lat', 'lon') }} as distance_km
from candidates
qualify row_number() over (partition by source_place_id
                           order by {{ haversine_km('destination_lat', 'destination_lon', 'lat', 'lon') }}) = 1
