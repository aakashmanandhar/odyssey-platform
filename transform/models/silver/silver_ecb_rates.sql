-- One row per (currency, date): units of currency per 1 EUR.
-- The currency is read from the series KEY (EXR.D.<CURRENCY>.EUR.SP00.A), which every ECB CSV variant contains.
-- Other columns are located by header name; a missing column yields null and the row is dropped.
with batches as (
    select split(response_csv, '\\r?\\n') as lines, _ingested_at
    from {{ source('bronze', 'fx_raw') }}
    where http_status = 200
),
data_rows as (
    select split(trim(lines[0]), ',') as header, split(trim(line), ',') as cols, _ingested_at
    from batches
    lateral view posexplode(lines) t as pos, line
    where pos > 0 and trim(line) <> ''
),
positions as (
    select cols, _ingested_at,
           cast(array_position(header, 'KEY') as int)         as key_pos,
           cast(array_position(header, 'TIME_PERIOD') as int) as date_pos,
           cast(array_position(header, 'OBS_VALUE') as int)   as value_pos
    from data_rows
),
parsed as (
    select
        case when key_pos > 0 then element_at(split(element_at(cols, key_pos), '\\.'), 3) end   as currency,
        case when date_pos > 0 then try_to_date(element_at(cols, date_pos)) end                as rate_date,
        case when value_pos > 0 then try_cast(element_at(cols, value_pos) as double) end      as rate_per_eur,
        _ingested_at
    from positions
)
select currency, rate_date, rate_per_eur, _ingested_at
from parsed
where currency is not null and rate_date is not null and rate_per_eur is not null
qualify row_number() over (partition by currency, rate_date order by _ingested_at desc) = 1
