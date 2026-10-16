-- Wikipedia articles near each destination (latest batch). Property results arrive split across
-- continuation responses, so each article is re-assembled with max() over its partial rows.
-- coord_type is the article's coordinate type (city, adm1st, landmark, mountain, ...).
with responses as (
    select destination_qid, country_iso3, response_json
    from {{ source('bronze', 'notable_places_raw') }}
    where query_name = 'wikipedia_geosearch'
      and _batch_id = (select max_by(_batch_id, _ingested_at) from {{ source('bronze', 'notable_places_raw') }})
),
pages as (
    select destination_qid, country_iso3, explode(from_json(response_json,
        'struct<query:struct<pages:array<struct<pageid:bigint,title:string,
            coordinates:array<struct<lat:double,lon:double,type:string,dim:string>>,pageimage:string,
            pageprops:struct<wikibase_item:string>,pageviews:map<string,bigint>,
            langlinks:array<struct<lang:string,title:string>>>>>>'
    ).query.pages) as p
    from responses
)
select
    destination_qid,
    country_iso3,
    p.pageid                                                                    as page_id,
    max(p.title)                                                                as title,
    max(get(p.coordinates, 0).lat)                                              as lat,
    max(get(p.coordinates, 0).lon)                                              as lon,
    max(get(p.coordinates, 0).type)                                             as coord_type,
    max(get(p.coordinates, 0).dim)                                              as coord_dim,
    max(p.pageimage)                                                            as page_image,
    max(p.pageprops.wikibase_item)                                              as wikidata_id,
    max(aggregate(map_values(p.pageviews), cast(0 as bigint), (acc, x) -> acc + coalesce(x, cast(0 as bigint)))) as views_30d,
    max(get(p.langlinks, 0).title)                                              as local_title
from pages
group by 1, 2, 3
