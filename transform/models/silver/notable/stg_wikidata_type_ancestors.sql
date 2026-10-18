{{ config(tags=['after_ml']) }}
-- Every superclass (P279*, including itself) of every Wikidata type seen on a notable place (latest batch).
with latest as (
    select max_by(_batch_id, _ingested_at) as batch from {{ source('bronze', 'wikidata_types_raw') }}
),
bindings as (
    select explode(from_json(response_json,
        'struct<results:struct<bindings:array<struct<type:struct<value:string>,ancestor:struct<value:string>>>>>'
    ).results.bindings) as b
    from {{ source('bronze', 'wikidata_types_raw') }}
    where query_name = 'wikidata_type_ancestors' and _batch_id = (select batch from latest)
)
select distinct
    nullif(regexp_extract(b.type.value, '(Q[0-9]+)$', 1), '')      as type_qid,
    nullif(regexp_extract(b.ancestor.value, '(Q[0-9]+)$', 1), '')  as ancestor_qid
from bindings
