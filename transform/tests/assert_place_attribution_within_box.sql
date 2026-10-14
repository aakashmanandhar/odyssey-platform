-- A place attributed to a destination must lie within that destination's box (corner distance <= 15 km * sqrt(2) ~ 21.3 km).
select place_source_key, destination_key, distance_km
from {{ ref('silver_places') }}
where distance_km > 21.3
