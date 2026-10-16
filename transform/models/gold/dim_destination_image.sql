-- One usable photo per destination and role (main photo, page banner), with a ready-to-show credit line.
-- is_hero marks the photo for cards and page headers: the main photo, else the banner.
with usable as (
    select *
    from {{ ref('silver_destination_images') }}
    where is_open_license and thumb_url is not null and mime in ('image/jpeg', 'image/png', 'image/webp', 'image/tiff')
),
one_per_role as (
    select *
    from usable
    qualify row_number() over (partition by destination_qid, role
                               order by (width >= 1.2 * height) desc, width desc, file_name) = 1
)
select
    d.destination_key,
    d.country_key,
    i.role,
    row_number() over (partition by d.destination_key order by case i.role when 'main' then 0 else 1 end) = 1 as is_hero,
    i.thumb_url, i.thumb_width, i.thumb_height, i.original_url, i.aspect_ratio,
    i.author, i.license_short, i.license_url, i.attribution_required,
    i.credit_text, i.commons_page_url, i.file_name
from one_per_role i
join {{ ref('dim_destination') }} d on d.destination_key = i.destination_qid
