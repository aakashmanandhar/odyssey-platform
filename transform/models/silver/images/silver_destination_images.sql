-- Destination photos with licence checks. Only openly licensed files (CC0, public domain, CC BY, CC BY-SA) are usable.
select
    w.destination_qid,
    w.role,
    w.file_name,
    c.commons_page_url, c.original_url, c.thumb_url, c.thumb_width, c.thumb_height,
    c.width, c.height, round(c.width / nullif(c.height, 0), 3)                  as aspect_ratio,
    c.mime, c.author, c.license_short, c.license_url, c.attribution_required, c.description,
    lower(c.license_short) rlike '^(cc0|public domain|pd|cc by(-sa)? [0-9.]+)'
        and not lower(c.license_short) rlike '(nc|nd)'                          as is_open_license,
    concat('Photo: ', coalesce(c.author, 'Unknown author'), ' · ', coalesce(c.license_short, 'licence unknown'),
           ' · Wikimedia Commons')                                              as credit_text
from {{ ref('stg_image_wikidata') }} w
left join {{ ref('stg_commons_imageinfo') }} c
  on lower(replace(c.file_name, '_', ' ')) = lower(replace(w.file_name, '_', ' '))
