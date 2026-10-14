{{ config(tags=['after_ml']) }}
-- Model-accepted pairs, flagged when each side is the other's best-scoring partner (one-to-one).
with accepted as (
    select * from {{ source('ml', 'er_pair_scores') }} where is_match
)
select
    overture_key, foursquare_key, country_iso3, match_score, model_version,
    row_number() over (partition by overture_key order by match_score desc, foursquare_key) = 1
    and row_number() over (partition by foursquare_key order by match_score desc, overture_key) = 1 as is_mutual_best
from accepted
