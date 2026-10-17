{{ config(tags=['after_ml']) }}
-- "Must-see" list per destination: the 30 most popular sights and activities near it.
-- Built from every eligible Wikipedia article (so famous places missing from Overture/Foursquare still appear),
-- linked to the golden place where one was matched. Score = log10(1 + 30-day page views)
-- + 0.3 for a usable photo + 0.2 when the place is confirmed by both place sources.
-- Eligible: not an area article; not infrastructure, institutions, venues or events (type and whole-word title
-- rules, incl. local-language stadium words); a matched place must be a sight or activity or a landmark;
-- an unmatched article must be a typed physical feature.
-- Membership: an article found by several destinations' searches belongs to the nearest destination centre,
-- and also to any other destination at most 1.10x that distance (so twin cities like Kathmandu and Lalitpur
-- no longer share the same top sights, while places genuinely between two destinations can still appear in both).
with photos as (
    select lower(replace(file_name, '_', ' ')) as k, thumb_url, author, license_short
    from {{ ref('stg_commons_imageinfo') }}
    where is_open_license and thumb_url is not null
),
hits as (
    select distinct
        g.destination_qid, g.country_iso3, g.page_id,
        2 * 6371008.8 * asin(sqrt(
              pow(sin(radians(g.lat - d.lat) / 2), 2)
            + cos(radians(d.lat)) * cos(radians(g.lat)) * pow(sin(radians(g.lon - d.lon) / 2), 2)
        ))                                                                      as center_m
    from {{ ref('stg_wiki_geosearch_pages') }} g
    join {{ ref('dim_destination') }} d on d.destination_key = g.destination_qid
    where g.lat is not null and d.lat is not null
),
membership as (
    select destination_qid, country_iso3, page_id
    from (select *, min(center_m) over (partition by page_id) as nearest_m from hits)
    where center_m <= 1.10 * nearest_m
),
base as (
    select
        n.*,
        coalesce(regexp_extract(lower(n.coord_type), '^([a-z]+)', 1), '')       as wiki_type,
        w.odyssey_place_id, w.thumb_url as place_photo, w.credit_text as place_credit,
        p.odyssey_category, p.sources,
        ph.thumb_url as article_photo, ph.author as article_photo_author, ph.license_short as article_photo_license
    from (
        select a.* except (destination_qid, country_iso3), m.destination_qid, m.country_iso3
        from {{ ref('silver_notable_places') }} a
        join membership m on m.page_id = a.page_id
    ) n
    left join {{ ref('dim_place_wiki') }} w on w.wikipedia_page_id = n.page_id
    left join {{ ref('dim_place') }} p on p.odyssey_place_id = w.odyssey_place_id
    left join photos ph on ph.k = lower(replace(n.page_image, '_', ' '))
),
eligible as (
    select
        destination_qid                                                         as destination_key,
        country_iso3                                                            as country_key,
        page_id                                                                 as wikipedia_page_id,
        title_clean                                                             as title,
        local_title, lat, lon, views_30d, wikidata_id, odyssey_place_id, wiki_type,
        coalesce(odyssey_category, 'see')                                       as category,
        coalesce(size(sources), 0)                                              as n_place_sources,
        coalesce(place_photo, article_photo)                                    as photo_url,
        coalesce(place_credit,
                 case when article_photo is not null then concat('Photo: ', coalesce(article_photo_author, 'Unknown author'),
                      ' · ', article_photo_license, ' · Wikimedia Commons') end) as photo_credit
    from base
    where not is_area_article
      and title_clean not in (select wikipedia_title from {{ ref('highlight_overrides') }} where action = 'exclude')
      and wiki_type not in ('railwaystation', 'edu', 'airport', 'event')
      and not lower(title) rlike '\\b(incident|battle|massacre|earthquake|prefecture|province|district|university|college|school|station|airport|kingdom|empire|dynasty|republic|court|exchange|ministry|embassy|bank|hospital|parliament|stadium|heart centre|medical|clinic|history of|list of)\\b'
      and not lower(title) rlike '\\b(disaster|tragedy|attacks?|bombings?|shootings?|siege|riots?|protests?|uprising|revolution|eruption|floods?|crash|derailment|pandemic|fire of|festival|carnival|film festival|olympics|world cup|grand prix|circuit|autodromo|autódromo|racecourse|racetrack|speedway|estadio|stade|stadio|stadion|deportes|deportivo|election|treaty|summit|federation|confederation|association|committee)\\b'
      and (
            (odyssey_place_id is not null and (odyssey_category in ('see', 'do') or wiki_type = 'landmark'))
         or (odyssey_place_id is null and wiki_type in ('landmark', 'mountain', 'waterbody', 'glacier', 'river', 'forest'))
      )
),
scored as (
    select *,
        round(log10(1 + views_30d)
              + case when photo_url is not null then 0.3 else 0 end
              + case when n_place_sources >= 2 then 0.2 else 0 end, 3)          as highlight_score
    from eligible
)
select
    destination_key, country_key,
    row_number() over (partition by destination_key order by highlight_score desc, views_30d desc, wikipedia_page_id) as highlight_rank,
    title, local_title, category, wiki_type, highlight_score, views_30d,
    odyssey_place_id, odyssey_place_id is not null                              as is_in_place_index,
    wikipedia_page_id, wikidata_id, lat, lon,
    photo_url, photo_credit
from scored
qualify highlight_rank <= 30
