-- Wikipedia articles near each destination (latest batch): geosearch hits (which destination, how far)
-- joined to article details (coordinates and type, photo, Wikidata ID, 30-day views, local title).
with latest as (
    select max_by(_batch_id, _ingested_at) as b
    from {{ source('bronze', 'notable_places_raw') }}
    where query_name in ('wikipedia_geosearch_list', 'wikipedia_pages')
),
hits as (
    select destination_qid, country_iso3, g.pageid as page_id, min(g.dist) as dist_m, max(g.type) as gs_type
    from (
        select destination_qid, country_iso3, explode(from_json(response_json,
            'struct<query:struct<geosearch:array<struct<pageid:bigint,dist:double,type:string>>>>').query.geosearch) as g
        from {{ source('bronze', 'notable_places_raw') }}
        where query_name = 'wikipedia_geosearch_list' and _batch_id = (select b from latest)
    )
    group by 1, 2, 3
),
details as (
    select
        p.pageid                                                                as page_id,
        max(p.title)                                                            as title,
        max(get(p.coordinates, 0).lat)                                          as lat,
        max(get(p.coordinates, 0).lon)                                          as lon,
        max(get(p.coordinates, 0).type)                                         as coord_type,
        max(get(p.coordinates, 0).dim)                                          as coord_dim,
        max(p.pageimage)                                                        as page_image,
        max(p.pageprops.wikibase_item)                                          as wikidata_id,
        max(aggregate(map_values(p.pageviews), cast(0 as bigint), (acc, x) -> acc + coalesce(x, cast(0 as bigint)))) as views_30d,
        max(get(p.langlinks, 0).title)                                          as local_title
    from (
        select explode(from_json(response_json,
            'struct<query:struct<pages:array<struct<pageid:bigint,title:string,
                coordinates:array<struct<lat:double,lon:double,type:string,dim:string>>,pageimage:string,
                pageprops:struct<wikibase_item:string>,pageviews:map<string,bigint>,
                langlinks:array<struct<lang:string,title:string>>>>>>').query.pages) as p
        from {{ source('bronze', 'notable_places_raw') }}
        where query_name = 'wikipedia_pages' and _batch_id = (select b from latest)
    )
    group by 1
)
select
    h.destination_qid, h.country_iso3, h.page_id, h.dist_m,
    d.title, d.lat, d.lon,
    coalesce(d.coord_type, h.gs_type)                                           as coord_type,
    d.coord_dim, d.page_image, d.wikidata_id, d.views_30d, d.local_title
from hits h
join details d on d.page_id = h.page_id
