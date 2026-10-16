{#- Name helpers for matching across sources: a comparison key and character-trigram Jaccard similarity. -#}
{% macro name_key(s) -%}
    regexp_replace(lower({{ s }}), '[^\\p{L}\\p{N}]', '')
{%- endmacro %}

{% macro trigrams(s) -%}
    case when length({{ s }}) < 3 then array({{ s }})
         else transform(sequence(1, length({{ s }}) - 2), i -> substr({{ s }}, i, 3)) end
{%- endmacro %}

{% macro trigram_jaccard(a, b) -%}
    case when coalesce({{ a }}, '') = '' or coalesce({{ b }}, '') = '' then 0.0
         else size(array_intersect({{ trigrams(a) }}, {{ trigrams(b) }}))
              / greatest(size(array_union({{ trigrams(a) }}, {{ trigrams(b) }})), 1) end
{%- endmacro %}
