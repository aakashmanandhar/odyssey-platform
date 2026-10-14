-- Features and weak labels per candidate pair.
-- Labels use ONLY phone numbers: a unique phone shared within 100 m = match; every other candidate of a
-- matched place = non-match (one real place matches at most one record per source).
-- Phone features are kept for reference but must NOT be used to train the model (label leakage).
with pairs as (
    select * from {{ ref('er_candidate_pairs') }}
),
places as (
    select place_source_key, source, country_iso3, name_normalized,
           regexp_replace(name_normalized, ' ', '') as name_compact,
           phone_normalized, website_domain, odyssey_category
    from {{ ref('silver_places') }}
),
phone_counts as (
    select source, country_iso3, phone_normalized, count(*) as n
    from {{ ref('silver_places') }}
    where length(phone_normalized) = 9
    group by 1, 2, 3
),
joined as (
    select
        p.*,
        o.name_compact as o_name, f.name_compact as f_name,
        o.odyssey_category as o_category, f.odyssey_category as f_category,
        o.phone_normalized as o_phone, f.phone_normalized as f_phone,
        o.website_domain is not null and f.website_domain is not null as both_domain,
        oc.n as o_phone_count, fc.n as f_phone_count,
        coalesce(p.same_phone and oc.n = 1 and fc.n = 1 and p.distance_m <= 100, false) as is_positive
    from pairs p
    join places o on o.place_source_key = p.overture_key
    join places f on f.place_source_key = p.foursquare_key
    left join phone_counts oc on oc.source = 'overture' and oc.country_iso3 = p.country_iso3 and oc.phone_normalized = o.phone_normalized
    left join phone_counts fc on fc.source = 'foursquare' and fc.country_iso3 = p.country_iso3 and fc.phone_normalized = f.phone_normalized
)
select
    overture_key || '|' || foursquare_key                                                     as pair_key,
    overture_key,
    foursquare_key,
    country_iso3,
    -- model features (no phone information)
    distance_m,
    name_trigram_jaccard,
    round(1 - levenshtein(o_name, f_name) / greatest(length(o_name), length(f_name), 1), 3)   as name_levenshtein_ratio,
    (instr(o_name, f_name) > 0 or instr(f_name, o_name) > 0)                                  as name_contained,
    abs(length(o_name) - length(f_name))                                                      as name_length_diff,
    same_domain,
    both_domain,
    o_category = f_category                                                                   as same_category,
    (o_category = 'other' or f_category = 'other')                                            as either_category_other,
    count(*) over (partition by overture_key)                                                 as n_candidates_overture,
    count(*) over (partition by foursquare_key)                                               as n_candidates_foursquare,
    rank() over (partition by overture_key order by name_trigram_jaccard desc, distance_m)   as name_rank_for_overture,
    rank() over (partition by foursquare_key order by name_trigram_jaccard desc, distance_m) as name_rank_for_foursquare,
    -- reference only (used for labels; never a model feature)
    same_phone,
    -- weak labels from unique phones only
    case
        when is_positive then 1
        when max(cast(is_positive as int)) over (partition by overture_key) = 1
          or max(cast(is_positive as int)) over (partition by foursquare_key) = 1 then 0
    end                                                                                       as weak_label
from joined
