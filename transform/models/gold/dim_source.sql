-- Source registry as a dimension: every fact can be traced to its source and license.
select
    source_id,
    source_name,
    split(feeds, ';')       as feeds,
    method,
    cadence,
    cast(phase as int)      as phase,
    license,
    license_status,
    url,
    notes
from {{ ref('source_registry') }}
