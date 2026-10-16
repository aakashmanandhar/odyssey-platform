{{ config(tags=['after_ml']) }}
-- Golden places matched to a Wikipedia article: popularity (30-day page views), Wikidata ID and,
-- where the article's lead photo is openly licensed, the photo with its credit line.
select
    m.odyssey_place_id,
    p.destination_key,
    p.country_key,
    n.page_id                                                                   as wikipedia_page_id,
    n.title                                                                     as wikipedia_title,
    n.local_title,
    n.wikidata_id,
    n.views_30d,
    n.views_rank_in_destination,
    c.thumb_url is not null                                                     as has_photo,
    c.thumb_url, c.thumb_width, c.thumb_height, c.original_url,
    c.author, c.license_short, c.license_url, c.commons_page_url,
    case when c.thumb_url is not null then
        concat('Photo: ', coalesce(c.author, 'Unknown author'), ' · ', c.license_short, ' · Wikimedia Commons') end as credit_text,
    m.name_sim, m.name_contained, m.distance_m
from {{ ref('er_notable_place_matches') }} m
join {{ ref('silver_notable_places') }} n on n.page_id = m.page_id
join {{ ref('dim_place') }} p on p.odyssey_place_id = m.odyssey_place_id
left join {{ ref('stg_commons_imageinfo') }} c
  on lower(replace(c.file_name, '_', ' ')) = lower(replace(n.page_image, '_', ' '))
 and c.is_open_license
