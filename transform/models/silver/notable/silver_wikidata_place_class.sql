{{ config(tags=['after_ml']) }}
-- One row per notable-place Wikidata item: which policy classes its types fall under, and its countries.
-- Policy (seed wikidata_class_rules): exclude = never a sight; soft_exclude = excluded unless also a recognised sight;
-- settlement = town or admin area (fine on a region page, not a sight on a city page); include = recognised sight.
with item_types as (
    select distinct wikidata_id, type_qid from {{ ref('stg_wikidata_item_types') }}
    where wikidata_id is not null and type_qid is not null
),
matched as (
    select it.wikidata_id, r.rule, r.label
    from item_types it
    join {{ ref('stg_wikidata_type_ancestors') }} a on a.type_qid = it.type_qid
    join {{ ref('wikidata_class_rules') }} r on r.class_qid = a.ancestor_qid
),
flags as (
    select
        wikidata_id,
        bool_or(rule = 'exclude')                                as is_excluded_type,
        bool_or(rule = 'soft_exclude')                           as is_soft_excluded_type,
        bool_or(rule = 'settlement')                             as is_settlement,
        bool_or(rule = 'include')                                as is_sight,
        sort_array(collect_set(concat(rule, ': ', label)))       as matched_rules
    from matched
    group by wikidata_id
),
countries as (
    select wikidata_id, sort_array(collect_set(country_qid)) as country_qids
    from {{ ref('stg_wikidata_item_types') }}
    where wikidata_id is not null and country_qid is not null
    group by wikidata_id
),
items as (
    select distinct wikidata_id from {{ ref('stg_wikidata_item_types') }} where wikidata_id is not null
)
select
    i.wikidata_id,
    coalesce(f.is_excluded_type, false)                          as is_excluded_type,
    coalesce(f.is_soft_excluded_type, false)                     as is_soft_excluded_type,
    coalesce(f.is_settlement, false)                             as is_settlement,
    coalesce(f.is_sight, false)                                  as is_sight,
    coalesce(f.matched_rules, array())                           as matched_rules,
    coalesce(c.country_qids, array())                            as country_qids
from items i
left join flags f on f.wikidata_id = i.wikidata_id
left join countries c on c.wikidata_id = i.wikidata_id
