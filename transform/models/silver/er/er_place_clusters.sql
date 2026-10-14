{{ config(tags=['after_ml']) }}
-- Every silver place with its cluster anchor: a Foursquare place anchors itself and any Overture records linked to it
-- (exact copy links or mutual-best model matches). Unlinked places anchor themselves.
with edges as (
    select overture_key, foursquare_key, 'exact' as match_type, cast(1.0 as double) as match_score
    from {{ ref('silver_place_exact_links') }}
    union all
    select overture_key, foursquare_key, 'model', match_score
    from {{ ref('er_mutual_matches') }} where is_mutual_best
),
overture_edge as (
    select * from edges
    qualify row_number() over (partition by overture_key
                               order by case match_type when 'exact' then 0 else 1 end, match_score desc) = 1
)
select
    p.place_source_key,
    p.source,
    case when p.source = 'foursquare' then p.place_source_key
         else coalesce(e.foursquare_key, p.place_source_key) end   as cluster_anchor,
    e.match_type,
    e.match_score
from {{ ref('silver_places') }} p
left join overture_edge e on p.source = 'overture' and e.overture_key = p.place_source_key
