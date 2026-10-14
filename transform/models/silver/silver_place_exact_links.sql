-- Known matches: Overture places whose sources[] name a Foursquare place that exists in silver.
-- These are the ground-truth labels for blocking design, model training and evaluation.
select
    o.place_source_key                                                   as overture_key,
    f.place_source_key                                                   as foursquare_key,
    o.country_iso3,
    o.destination_key,
    round({{ haversine_km('o.lat', 'o.lon', 'f.lat', 'f.lon') }} * 1000, 1) as distance_m,
    h3_distance(o.h3_r9, f.h3_r9)                                        as h3_r9_distance,
    o.name_normalized = f.name_normalized                                as same_name,
    case when o.phone_normalized is not null and f.phone_normalized is not null
         then o.phone_normalized = f.phone_normalized end                as same_phone,
    case when o.website_domain is not null and f.website_domain is not null
         then o.website_domain = f.website_domain end                    as same_domain,
    o.odyssey_category = f.odyssey_category                              as same_category,
    o.name                                                               as overture_name,
    f.name                                                               as foursquare_name
from {{ ref('silver_places') }} o
join {{ ref('silver_places') }} f
  on f.source = 'foursquare' and f.source_place_id = o.linked_fsq_place_id
where o.source = 'overture'
