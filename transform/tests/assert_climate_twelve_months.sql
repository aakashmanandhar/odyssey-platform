-- Fails if a destination does not have exactly 12 distinct months, or a score is outside 0-100.
select destination_key, 'months' as issue from {{ ref('fact_destination_climate_month') }}
group by destination_key having count(distinct month_num) <> 12 or count(*) <> 12
union all
select destination_key, 'score' from {{ ref('fact_destination_climate_month') }}
where comfort_score < 0 or comfort_score > 100
