{{ config(tags=['after_ml']) }}
-- Golden places: one row per real-world place, attributes chosen by survivorship rules, with lineage.
with members as (
    select r.odyssey_place_id, p.*, c.match_type, c.match_score
    from {{ ref('place_id_registry') }} r
    join {{ ref('er_place_clusters') }} c on c.place_source_key = r.place_source_key
    join {{ ref('silver_places') }} p on p.place_source_key = r.place_source_key
)
select
    odyssey_place_id,
    {{ best('name', "case when source = 'foursquare' then 1 else 0 end") }}                    as name,
    {{ best('lat', "case when source = 'foursquare' then 1 else 0 end") }}                     as lat,
    {{ best('lon', "case when source = 'foursquare' then 1 else 0 end") }}                     as lon,
    {{ best('odyssey_category', "case when odyssey_category <> 'other' then 2 else 0 end + case when source = 'foursquare' then 1 else 0 end") }} as odyssey_category,
    {{ best('phone_normalized', "case when phone_normalized is not null then 2 else 0 end + case when source = 'foursquare' then 1 else 0 end") }} as phone_normalized,
    {{ best('website_domain', "case when website_domain is not null then 2 else 0 end + case when source = 'foursquare' then 1 else 0 end") }}   as website_domain,
    {{ best('destination_key', "case when source = 'foursquare' then 1 else 0 end") }}         as destination_key,
    {{ best('country_iso3', "case when source = 'foursquare' then 1 else 0 end") }}            as country_key,
    max(cast(is_closed as int)) = 1                                                             as is_closed,
    array_sort(collect_set(source))                                                             as sources,
    count(*)                                                                                    as source_records,
    array_sort(collect_list(place_source_key))                                                  as source_keys,
    array_distinct(collect_list(name))                                                          as all_names,
    max(match_type)                                                                             as match_type,
    max(match_score)                                                                            as match_score
from members
group by odyssey_place_id
