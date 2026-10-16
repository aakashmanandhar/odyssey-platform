-- One row per Commons file: URLs, size, author and licence (HTML stripped).
-- Reads the latest batch of each image source (destination photos, notable-place photos).
with responses as (
    select response_json
    from {{ source('bronze', 'images_raw') }}
    where query_name = 'commons_imageinfo'
      and _batch_id = (select max_by(_batch_id, _ingested_at) from {{ source('bronze', 'images_raw') }})
    union all
    select response_json
    from {{ source('bronze', 'notable_places_raw') }}
    where query_name = 'commons_imageinfo'
      and _batch_id = (select max_by(_batch_id, _ingested_at) from {{ source('bronze', 'notable_places_raw') }})
),
pages as (
    select explode(from_json(response_json,
        'struct<query:struct<pages:array<struct<title:string,missing:boolean,imageinfo:array<struct<
            thumburl:string,thumbwidth:int,thumbheight:int,url:string,descriptionurl:string,
            width:int,height:int,mime:string,extmetadata:map<string,struct<value:string>>>>>>>>'
    ).query.pages) as p
    from responses
),
info as (
    select substring(p.title, 6) as file_name, get(p.imageinfo, 0) as i
    from pages
    where not coalesce(p.missing, false) and size(p.imageinfo) > 0
    qualify row_number() over (partition by lower(replace(substring(p.title, 6), '_', ' ')) order by p.title) = 1
)
select
    file_name,
    i.descriptionurl                                                            as commons_page_url,
    i.url                                                                       as original_url,
    i.thumburl                                                                  as thumb_url,
    i.thumbwidth                                                                as thumb_width,
    i.thumbheight                                                               as thumb_height,
    i.width, i.height, i.mime,
    nullif(trim(regexp_replace(regexp_replace(i.extmetadata['Artist'].value, '<[^>]+>', ''), '&amp;', '&')), '') as author,
    i.extmetadata['LicenseShortName'].value                                     as license_short,
    i.extmetadata['LicenseUrl'].value                                           as license_url,
    coalesce(i.extmetadata['AttributionRequired'].value, 'true') = 'true'       as attribution_required,
    left(trim(regexp_replace(i.extmetadata['ImageDescription'].value, '<[^>]+>', '')), 300) as description,
    lower(i.extmetadata['LicenseShortName'].value) rlike '^(cc0|public domain|pd|cc by(-sa)? [0-9.]+)'
        and not lower(i.extmetadata['LicenseShortName'].value) rlike '(nc|nd)'  as is_open_license
from info
