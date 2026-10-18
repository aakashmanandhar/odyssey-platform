{{ config(tags=['after_ml']) }}
-- Wikidata instance-of (P31) and country (P17) for every notable-place item (latest batch). One row per item/type/country.
with latest as (
    select max_by(_batch_id, _ingested_at) as batch from {{ source('bronze', 'wikidata_types_raw') }}
),
bindings as (
    select explode(from_json(response_json,
        'struct<results:struct<bindings:array<struct<item:struct<value:string>,type:struct<value:string>,country:struct<value:string>>>>>'
    ).results.bindings) as b
    from {{ source('bronze', 'wikidata_types_raw') }}
    where query_name = 'wikidata_item_types' and _batch_id = (select batch from latest)
)
select distinct
    nullif(regexp_extract(b.item.value, '(Q[0-9]+)$', 1), '')     as wikidata_id,
    nullif(regexp_extract(b.type.value, '(Q[0-9]+)$', 1), '')     as type_qid,
    nullif(regexp_extract(b.country.value, '(Q[0-9]+)$', 1), '')  as country_qid
from bindings
