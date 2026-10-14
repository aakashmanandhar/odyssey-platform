-- Candidate pairs (Overture x Foursquare) within 150 m that share rare name trigrams, a phone, or a website domain.
with tokens as (
    select *, size(trigrams) as n_trigrams from {{ ref('er_place_tokens') }}
),
exploded as (
    select place_source_key, source, country_iso3, h3_r10, tri
    from tokens lateral view explode(trigrams) t as tri
),
country_size as (
    select country_iso3, count(*) as places from tokens group by country_iso3
),
rare as (
    select d.country_iso3, d.tri
    from (select country_iso3, tri, count(*) as df from exploded group by country_iso3, tri) d
    join country_size c on c.country_iso3 = d.country_iso3
    where d.df <= greatest(50, 0.005 * c.places)
),
o_tri as (
    select e.place_source_key, e.country_iso3, e.h3_r10 as cell, e.tri
    from exploded e join rare r on r.country_iso3 = e.country_iso3 and r.tri = e.tri
    where e.source = 'overture'
),
f_tri as (
    select e.place_source_key, e.country_iso3, cell, e.tri
    from exploded e join rare r on r.country_iso3 = e.country_iso3 and r.tri = e.tri
    lateral view explode(h3_kring(e.h3_r10, 1)) k as cell
    where e.source = 'foursquare'
),
by_name as (
    select o.place_source_key as overture_key, f.place_source_key as foursquare_key
    from o_tri o join f_tri f on f.country_iso3 = o.country_iso3 and f.cell = o.cell and f.tri = o.tri
    group by 1, 2
),
by_phone as (
    select o.place_source_key, f.place_source_key
    from tokens o join tokens f on f.country_iso3 = o.country_iso3 and f.phone_normalized = o.phone_normalized
    where o.source = 'overture' and f.source = 'foursquare' and length(o.phone_normalized) = 9
),
by_domain as (
    select o.place_source_key, f.place_source_key
    from tokens o join tokens f on f.country_iso3 = o.country_iso3 and f.website_domain = o.website_domain
    where o.source = 'overture' and f.source = 'foursquare'
),
all_pairs as (
    select overture_key, foursquare_key from by_name
    union select * from by_phone
    union select * from by_domain
)
select
    p.overture_key,
    p.foursquare_key,
    o.country_iso3,
    round({{ haversine_km('o.lat', 'o.lon', 'f.lat', 'f.lon') }} * 1000, 1)                 as distance_m,
    round(size(array_intersect(o.trigrams, f.trigrams)) / size(array_union(o.trigrams, f.trigrams)), 3) as name_trigram_jaccard,
    o.phone_normalized is not null and o.phone_normalized = f.phone_normalized              as same_phone,
    o.website_domain is not null and o.website_domain = f.website_domain                    as same_domain
from all_pairs p
join tokens o on o.place_source_key = p.overture_key
join tokens f on f.place_source_key = p.foursquare_key
where {{ haversine_km('o.lat', 'o.lon', 'f.lat', 'f.lon') }} <= 0.15
  and (size(array_intersect(o.trigrams, f.trigrams)) / size(array_union(o.trigrams, f.trigrams)) >= 0.2
       or (o.phone_normalized is not null and o.phone_normalized = f.phone_normalized)
       or (o.website_domain is not null and o.website_domain = f.website_domain))
