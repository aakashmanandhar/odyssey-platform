{{ config(tags=['after_ml']) }}
-- Entity-resolution accuracy from evaluation sample v1: 300 stratified pairs, labelled by an AI reviewer (Claude),
-- not by a human. Rates exclude "unsure"; strata are weighted by their population at sampling time; Nepal excluded.
-- precision_merges: share of merged pairs that are the same place.
-- precision_accepts: same, over all pairs the model accepted (merged + held back by the one-to-one rule).
-- recall_upper_bound: found / (found + misses in the two sampled rejected strata). Misses among dissimilar names
-- (e.g. different scripts) were not sampled, so true recall is lower.
with l as (select * from {{ ref('er_eval_labels') }} where label <> 'unsure'),
s as (
    select stratum, max(stratum_population) as pop, count(*) as n,
           avg(case when label = 'same' then 1.0 else 0.0 end) as same_rate
    from l group by stratum
),
w as (select max(case when stratum = 'A_merged' then pop * same_rate end) as tp_a,
             max(case when stratum = 'B_held_back' then pop * same_rate end) as tp_b,
             max(case when stratum = 'C_near_miss' then pop * same_rate end) as fn_c,
             max(case when stratum = 'D_similar_name_rejected' then pop * same_rate end) as fn_d,
             max(case when stratum = 'A_merged' then pop end) as pop_a,
             max(case when stratum = 'B_held_back' then pop end) as pop_b,
             max(case when stratum = 'A_merged' then same_rate end) as precision_merges,
             max(case when stratum = 'A_merged' then n end) as n_merged
      from s)
select
    'v1'                                                                       as eval_set,
    (select max(labeller) from {{ ref('er_eval_labels') }})                    as labeller,
    (select count(*) from {{ ref('er_eval_labels') }})                         as labels,
    (select count(*) from {{ ref('er_eval_labels') }} where label = 'unsure')  as unsure,
    n_merged                                                                   as merged_pairs_judged,
    round(precision_merges, 3)                                                 as precision_merges,
    round((tp_a + tp_b) / (pop_a + pop_b), 3)                                  as precision_accepts,
    round((tp_a + tp_b) / (tp_a + tp_b + fn_c + fn_d), 3)                      as recall_upper_bound,
    current_timestamp()                                                        as computed_at
from w
