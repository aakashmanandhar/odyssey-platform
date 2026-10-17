{{ config(tags=['after_ml']) }}
-- One-to-one links between Wikipedia articles and golden places: accepted by name and distance rules,
-- then kept only when each side is the other's best candidate.
with accepted as (
    select c.*
    from {{ ref('er_notable_place_candidates') }} c
    join {{ ref('silver_notable_places') }} n on n.page_id = c.page_id
    join {{ ref('dim_place') }} p on p.odyssey_place_id = c.odyssey_place_id
    -- a landmark article never describes a restaurant, hotel or shop (e.g. Fushimi Inari vs a cafe at its gate)
    where not (lower(coalesce(n.coord_type, '')) like 'landmark%' and p.odyssey_category in ('eat', 'stay', 'shop'))
      and ((name_contained and distance_m <= 250)
       or (name_sim >= 0.5 and distance_m <= 250)
       or (name_sim >= 0.35 and distance_m <= 60))
)
select page_id, odyssey_place_id, name_sim, name_contained, distance_m
from accepted
qualify row_number() over (partition by page_id order by name_contained desc, name_sim desc, distance_m, odyssey_place_id) = 1
    and row_number() over (partition by odyssey_place_id order by name_contained desc, name_sim desc, distance_m, page_id) = 1
