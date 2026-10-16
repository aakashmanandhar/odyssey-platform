-- Destination -> Commons file name, from the latest image batch. role: main (P18) or banner (P948, Wikivoyage).
with latest as (
    select response_json
    from {{ source('bronze', 'images_raw') }}
    where query_name = 'wikidata_p18_p948'
      and _batch_id = (select max_by(_batch_id, _ingested_at) from {{ source('bronze', 'images_raw') }})
),
bindings as (
    select explode(from_json(response_json,
        'struct<results:struct<bindings:array<struct<item:struct<value:string>,image:struct<value:string>,banner:struct<value:string>>>>>'
    ).results.bindings) as b
    from latest
),
roles as (
    select regexp_extract(b.item.value, '(Q[0-9]+)$', 1) as destination_qid, role, file_url
    from bindings
    lateral view stack(2, 'main', b.image.value, 'banner', b.banner.value) r as role, file_url
)
select distinct destination_qid, role, url_decode(regexp_extract(file_url, '/([^/]+)$', 1)) as file_name
from roles
where file_url is not null
