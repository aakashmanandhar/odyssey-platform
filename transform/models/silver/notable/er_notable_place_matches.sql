{{ config(tags=['after_ml']) }}
-- One-to-one links between Wikipedia articles and golden places: accepted by name and distance rules,
-- then kept only when each side is the other's best candidate.
with accepted as (
    select *
    from {{ ref('er_notable_place_candidates') }}
    where (name_contained and distance_m <= 250)
       or (name_sim >= 0.5 and distance_m <= 250)
       or (name_sim >= 0.35 and distance_m <= 60)
)
select page_id, odyssey_place_id, name_sim, name_contained, distance_m
from accepted
qualify row_number() over (partition by page_id order by name_contained desc, name_sim desc, distance_m, odyssey_place_id) = 1
    and row_number() over (partition by odyssey_place_id order by name_contained desc, name_sim desc, distance_m, page_id) = 1
