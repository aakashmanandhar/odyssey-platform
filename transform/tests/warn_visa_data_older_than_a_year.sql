{{ config(severity='warn') }}
-- Visa rules change; warn (do not fail) when the dataset is more than a year old.
select max(data_published_at) as data_as_of
from {{ ref('fact_visa_requirement') }}
having max(data_published_at) < current_timestamp() - interval 365 days
