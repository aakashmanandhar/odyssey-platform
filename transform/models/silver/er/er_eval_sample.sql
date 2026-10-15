{{ config(tags=['after_ml']) }}
-- Stratified sample of candidate pairs for human labelling. Deterministic (hash-ordered), so reruns give the same sample.
-- Each row carries its stratum's total size so results can be weighted back to population estimates.
with scored as (
    select s.pair_key, s.overture_key, s.foursquare_key, s.country_iso3, s.match_score, s.is_match,
           coalesce(m.is_mutual_best, false) as is_mutual_best,
           f.distance_m, f.name_trigram_jaccard
    from {{ source('ml', 'er_pair_scores') }} s
    join {{ ref('er_pair_features') }} f on f.pair_key = s.pair_key
    left join {{ ref('er_mutual_matches') }} m on m.overture_key = s.overture_key and m.foursquare_key = s.foursquare_key
),
stratified as (
    select *,
        case
            when country_iso3 = 'NPL'                                       then 'E_nepal'
            when is_match and is_mutual_best                                then 'A_merged'
            when is_match                                                   then 'B_held_back'
            when match_score >= 0.2                                         then 'C_near_miss'
            when name_trigram_jaccard >= 0.5                                then 'D_similar_name_rejected'
        end as stratum
    from scored
),
ranked as (
    select *,
           count(*) over (partition by stratum)                                         as stratum_population,
           row_number() over (partition by stratum order by xxhash64(pair_key, 'v1'))  as rn
    from stratified
    where stratum is not null
),
sampled as (
    select * from ranked
    where (stratum = 'A_merged' and rn <= 90) or (stratum = 'B_held_back' and rn <= 45)
       or (stratum = 'C_near_miss' and rn <= 60) or (stratum = 'D_similar_name_rejected' and rn <= 45)
       or (stratum = 'E_nepal' and rn <= 60)
)
select
    row_number() over (order by xxhash64(s.pair_key, 'shuffle'))  as sample_id,
    s.stratum, s.stratum_population, s.pair_key, s.country_iso3,
    round(s.match_score, 3) as match_score, s.is_match, s.is_mutual_best,
    s.distance_m, s.name_trigram_jaccard,
    o.name as a_name, o.category_path as a_category, o.odyssey_category as a_group,
    round(o.lat, 6) as a_lat, round(o.lon, 6) as a_lon, o.website_domain as a_domain,
    f.name as b_name, f.category_path as b_category, f.odyssey_category as b_group,
    round(f.lat, 6) as b_lat, round(f.lon, 6) as b_lon, f.website_domain as b_domain
from sampled s
join {{ ref('silver_places') }} o on o.place_source_key = s.overture_key
join {{ ref('silver_places') }} f on f.place_source_key = s.foursquare_key
