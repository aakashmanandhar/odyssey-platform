-- One row per Wikipedia article near a pilot destination, with its popularity rank in that destination.
-- is_area_article: the article is about a whole area (city, region, country, island) or an event, or its
-- title is one of our destination names; such articles never describe a single place and are not matched.
with destination_names as (
    select distinct lower(name) as n from {{ ref('silver_destinations') }}
),
ranked as (
    select *,
        rank() over (partition by destination_qid order by coalesce(views_30d, 0) desc) as views_rank_in_destination
    from {{ ref('stg_wiki_geosearch_pages') }}
    where lat is not null
)
select
    r.page_id, r.destination_qid, r.country_iso3, r.title,
    trim(regexp_replace(r.title, '\\s*\\([^)]*\\)$', ''))                       as title_clean,
    r.local_title, r.lat, r.lon, r.page_image, r.wikidata_id,
    r.coord_type, r.coord_dim,
    coalesce(r.views_30d, 0)                                                    as views_30d,
    r.views_rank_in_destination,
    coalesce(lower(r.coord_type) rlike '^(city|adm|country|isle|event)', false)
        or lower(trim(regexp_replace(r.title, '\\s*\\([^)]*\\)$', ''))) in (select n from destination_names)
                                                                                as is_area_article
from ranked r
qualify row_number() over (partition by r.page_id order by r.dist_m, r.destination_qid) = 1
