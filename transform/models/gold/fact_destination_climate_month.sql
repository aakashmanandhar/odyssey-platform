-- "When to go": monthly climate per destination with a travel comfort score (0-100).
-- Score = 100 x (0.50 temperature + 0.35 rain + 0.15 cloud), each part between 0 and 1:
--   temperature: average daily high 18-28 C = 1, falling linearly to 0 at 5 C and 38 C
--   rain: monthly total <= 30 mm = 1, falling linearly to 0 at 300 mm
--   cloud: <= 30% = 1, falling linearly to 0 at 85%
-- comfort_score is absolute (compare destinations). season_label is relative to the destination's own best month:
-- best = within 10 points of it, good = within 25, otherwise off-season (so hot places still have a best season).
with parts as (
    select *,
        case when temp_max_c between 18 and 28 then 1.0
             when temp_max_c < 18 then greatest(0.0, (temp_max_c - 5) / 13.0)
             else greatest(0.0, (38 - temp_max_c) / 10.0) end                   as temp_part,
        least(1.0, greatest(0.0, (300 - rain_mm_month) / 270.0))                as rain_part,
        least(1.0, greatest(0.0, (85 - cloud_pct) / 55.0))                      as cloud_part
    from {{ ref('silver_climate_monthly') }}
),
scored as (
    select *,
        round(100 * (0.50 * temp_part + 0.35 * rain_part + 0.15 * coalesce(cloud_part, 0.5)), 0) as comfort_score
    from parts
)
select
    s.destination_qid                                                          as destination_key,
    s.country_iso3                                                             as country_key,
    s.month_num, s.month_name,
    round(s.temp_mean_c, 1) as temp_mean_c, round(s.temp_max_c, 1) as temp_max_c, round(s.temp_min_c, 1) as temp_min_c,
    s.rain_mm_month, round(s.humidity_pct, 0) as humidity_pct, round(s.cloud_pct, 0) as cloud_pct,
    round(s.sunshine_mj_m2_day, 1) as sunshine_mj_m2_day, round(s.wind_m_s, 1) as wind_m_s,
    cast(s.comfort_score as int)                                               as comfort_score,
    case when s.comfort_score >= max(s.comfort_score) over (partition by s.destination_qid) - 10 then 'best'
         when s.comfort_score >= max(s.comfort_score) over (partition by s.destination_qid) - 25 then 'good'
         else 'off-season' end                                              as season_label,
    row_number() over (partition by s.destination_qid order by s.comfort_score desc, s.month_num) <= 3 as is_top_month,
    s.temp_rain_source, s.nasa_period
from scored s
join {{ ref('dim_destination') }} d on d.destination_key = s.destination_qid
