-- No highlight may be a Wikidata item whose type falls under an 'exclude' class in seed wikidata_class_rules (ADR-020).
select h.destination_key, h.title, c.matched_rules
from {{ ref('mart_destination_highlights') }} h
join {{ ref('silver_wikidata_place_class') }} c on c.wikidata_id = h.wikidata_id
where c.is_excluded_type
