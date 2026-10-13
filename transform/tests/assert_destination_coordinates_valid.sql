-- Fails if any destination has impossible coordinates.
select destination_key, name, lat, lon
from {{ ref('dim_destination') }}
where lat not between -90 and 90 or lon not between -180 and 180
