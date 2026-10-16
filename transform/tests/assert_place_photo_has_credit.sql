-- Fails if a place photo would be shown without its credit line or licence.
select odyssey_place_id from {{ ref('dim_place_wiki') }}
where has_photo and (credit_text is null or license_short is null)
