-- Fails if a destination has two highlights with the same rank, or a photo without its credit line.
select destination_key, cast(highlight_rank as string) as issue from {{ ref('mart_destination_highlights') }}
group by destination_key, highlight_rank having count(*) > 1
union all
select destination_key, 'photo without credit' from {{ ref('mart_destination_highlights') }}
where photo_url is not null and photo_credit is null
