-- One row per (passport, destination) from the latest batch, with a normalized requirement category.
with latest as (
    select * from {{ source('bronze', 'visa_raw') }}
    qualify row_number() over (order by _ingested_at desc) = 1
),
data_rows as (
    select split(trim(line), ',') as cols, source_version, source_published_at
    from latest
    lateral view posexplode(split(response_csv, '\\r?\\n')) t as pos, line
    where pos > 0 and trim(line) <> ''
)
select
    cols[0]                                           as passport_iso3,
    cols[1]                                           as destination_iso3,
    lower(trim(cols[2]))                              as requirement_raw,
    case
        when cols[2] rlike '^[0-9]+$' and cast(cols[2] as int) > 0 then 'visa_free'
        when lower(trim(cols[2])) = 'visa free'       then 'visa_free'
        when lower(trim(cols[2])) = 'visa on arrival' then 'visa_on_arrival'
        when lower(trim(cols[2])) = 'eta'             then 'eta'
        when lower(trim(cols[2])) = 'e-visa'          then 'e_visa'
        when lower(trim(cols[2])) = 'visa required'   then 'visa_required'
        when lower(trim(cols[2])) = 'no admission'    then 'no_admission'
        when trim(cols[2]) = '-1'                     then 'own_country'
        else 'unknown'
    end                                               as requirement_category,
    case when cols[2] rlike '^[0-9]+$' then cast(cols[2] as int) end as visa_free_days,
    source_version,
    to_timestamp(source_published_at)                 as data_published_at
from data_rows
