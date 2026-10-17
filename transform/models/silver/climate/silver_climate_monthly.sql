-- Monthly climate normals per destination and month (latest batches).
-- Temperature and rain: WorldClim 2.1 (1970-2000, ~4.5 km, elevation-aware); NASA POWER (2001-2025, ~50 km)
-- as fallback where WorldClim has no value (points over sea). Humidity, cloud, sunshine, wind: NASA POWER.
-- NASA's -999 (missing) becomes null.
with nasa as (
    select destination_qid, country_iso3,
           from_json(get_json_object(response_json, '$.properties.parameter'), 'map<string,map<string,double>>') as p,
           get_json_object(response_json, '$.header.range')                     as period
    from {{ source('bronze', 'climate_raw') }}
    where _batch_id = (select max_by(_batch_id, _ingested_at) from {{ source('bronze', 'climate_raw') }})
),
wc as (
    select destination_qid, month,
           max(case when variable = 'tmax' then value end)                      as tmax,
           max(case when variable = 'tmin' then value end)                      as tmin,
           max(case when variable = 'prec' then value end)                      as prec
    from {{ source('bronze', 'climate_worldclim_raw') }}
    where _batch_id = (select max_by(_batch_id, _ingested_at) from {{ source('bronze', 'climate_worldclim_raw') }})
    group by 1, 2
),
months as (
    select explode(arrays_zip(
        sequence(1, 12),
        array('JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'),
        array(31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31))) as m
),
nasa_months as (
    select n.destination_qid, n.country_iso3, n.period,
           m.m['0'] as month_num, initcap(m.m['1']) as month_name,
           nullif(n.p['T2M'][m.m['1']], -999)                                   as nasa_t_mean,
           nullif(n.p['T2M_MAX'][m.m['1']], -999)                               as nasa_t_max,
           nullif(n.p['T2M_MIN'][m.m['1']], -999)                               as nasa_t_min,
           nullif(n.p['PRECTOTCORR'][m.m['1']], -999) * m.m['2']                as nasa_rain_month,
           nullif(n.p['RH2M'][m.m['1']], -999)                                  as humidity_pct,
           nullif(n.p['CLOUD_AMT'][m.m['1']], -999)                             as cloud_pct,
           nullif(n.p['ALLSKY_SFC_SW_DWN'][m.m['1']], -999)                     as sunshine_mj_m2_day,
           nullif(n.p['WS2M'][m.m['1']], -999)                                  as wind_m_s
    from nasa n cross join months m
)
select
    n.destination_qid, n.country_iso3, n.month_num, n.month_name,
    coalesce((w.tmax + w.tmin) / 2, n.nasa_t_mean)                             as temp_mean_c,
    coalesce(w.tmax, n.nasa_t_max)                                             as temp_max_c,
    coalesce(w.tmin, n.nasa_t_min)                                             as temp_min_c,
    round(coalesce(w.prec, n.nasa_rain_month), 1)                              as rain_mm_month,
    n.humidity_pct, n.cloud_pct, n.sunshine_mj_m2_day, n.wind_m_s,
    case when w.tmax is not null then 'WorldClim 2.1 (1970-2000)' else 'NASA POWER (2001-2025, regional)' end as temp_rain_source,
    n.period                                                                   as nasa_period,
    n.nasa_t_max                                                               as nasa_temp_max_c
from nasa_months n
left join wc w on w.destination_qid = n.destination_qid and w.month = n.month_num
