-- Fails if a destination has more than one photo for a role or more than one hero.
select destination_key, role, count(*) as n from {{ ref('dim_destination_image') }} group by 1, 2 having count(*) > 1
union all
select destination_key, 'hero', count(*) from {{ ref('dim_destination_image') }} where is_hero group by 1 having count(*) > 1
