{#- Deterministic "pick the value with the highest weight" (ties broken by place_source_key). -#}
{% macro best(value, weight) -%}
    max(named_struct('w', {{ weight }}, 'k', place_source_key, 'v', {{ value }})).v
{%- endmacro %}
