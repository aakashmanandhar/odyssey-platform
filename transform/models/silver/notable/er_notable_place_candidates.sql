{{ config(tags=['after_ml']) }}
-- Golden places within 250 m of a Wikipedia article, with the best name similarity over all their names.
with n as (
    select page_id, lat, lon,
           {{ name_key('title_clean') }}                                        as k_en,
           {{ name_key('local_title') }}                                        as k_local,
           explode(h3_kring(h3_longlatash3(lon, lat, 10), 2))                   as h3
    from {{ ref('silver_notable_places') }}
    where not is_area_article
),
p as (
    select odyssey_place_id, lat, lon, h3_longlatash3(lon, lat, 10) as h3,
           array_distinct(concat(coalesce(all_names, array()), array(name)))    as names
    from {{ ref('dim_place') }}
    where not coalesce(is_closed, false)
),
pairs as (
    select n.page_id, p.odyssey_place_id, n.k_en, n.k_local, p.names,
           round({{ haversine_km('n.lat', 'n.lon', 'p.lat', 'p.lon') }} * 1000, 1) as distance_m
    from n join p on p.h3 = n.h3
),
named as (
    select page_id, odyssey_place_id, distance_m, k_en, k_local, {{ name_key('nm') }} as k_place
    from pairs lateral view explode(names) x as nm
    where distance_m <= 250
)
select
    page_id, odyssey_place_id, distance_m,
    max(greatest({{ trigram_jaccard('k_en', 'k_place') }}, {{ trigram_jaccard('k_local', 'k_place') }})) as name_sim,
    max(case
        when length(k_en) >= 5 and least(length(k_en), length(k_place)) >= 0.5 * greatest(length(k_en), length(k_place))
             and (instr(k_place, k_en) > 0 or instr(k_en, k_place) > 0) then 1
        when length(k_local) >= 2 and least(length(k_local), length(k_place)) >= 0.5 * greatest(length(k_local), length(k_place))
             and (instr(k_place, k_local) > 0 or instr(k_local, k_place) > 0) then 1
        else 0 end) = 1                                                         as name_contained
from named
where k_place <> ''
group by 1, 2, 3
having name_sim >= 0.3 or name_contained
