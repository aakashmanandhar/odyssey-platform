{{ config(materialized='incremental', unique_key='place_source_key', incremental_strategy='merge', tags=['after_ml']) }}
-- Persistent mapping source record -> Odyssey place ID. Clusters reuse their members' existing ID (smallest wins);
-- on a split the larger cluster keeps it; new clusters get a hash of their anchor. Records are never deleted.
with clusters as (
    select c.*, count(*) over (partition by c.cluster_anchor) as member_count
    from {{ ref('er_place_clusters') }} c
),
prior as (
    {% if is_incremental() %}
    select place_source_key, odyssey_place_id, first_seen_at from {{ this }}
    {% else %}
    select cast(null as string) as place_source_key, cast(null as string) as odyssey_place_id,
           cast(null as timestamp) as first_seen_at
    where 1 = 0
    {% endif %}
),
claims as (
    select c.cluster_anchor, min(p.odyssey_place_id) as claimed_id, max(c.member_count) as member_count
    from clusters c join prior p on p.place_source_key = c.place_source_key
    group by c.cluster_anchor
),
resolved as (
    select *, row_number() over (partition by claimed_id order by member_count desc, cluster_anchor) as claim_rank
    from claims
),
cluster_ids as (
    select a.cluster_anchor,
           case when r.claim_rank = 1 then r.claimed_id
                when r.claimed_id is not null then 'odp_' || substr(sha2(a.cluster_anchor || '|split|' || r.claimed_id, 256), 1, 16)
                else 'odp_' || substr(sha2(a.cluster_anchor, 256), 1, 16) end as odyssey_place_id
    from (select distinct cluster_anchor from clusters) a
    left join resolved r on r.cluster_anchor = a.cluster_anchor
)
select
    c.place_source_key,
    i.odyssey_place_id,
    c.cluster_anchor,
    coalesce(p.first_seen_at, current_timestamp()) as first_seen_at,
    current_timestamp()                            as last_seen_at
from clusters c
join cluster_ids i on i.cluster_anchor = c.cluster_anchor
left join prior p on p.place_source_key = c.place_source_key
