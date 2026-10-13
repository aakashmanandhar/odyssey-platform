{% snapshot snap_advisories %}
{#- SCD Type 2: a new version is recorded whenever any official warning flag changes. -#}
{{ config(
    schema='silver',
    unique_key='country_iso3',
    strategy='check',
    check_cols=['warning', 'partial_warning', 'situation_warning', 'situation_part_warning'],
    hard_deletes='invalidate'
) }}
select
    country_iso3, iso2, country_name_de, official_title, content_id,
    warning, partial_warning, situation_warning, situation_part_warning,
    advisory_level, advisory_label, effective_at, source_last_modified_at
from {{ ref('silver_advisories_current') }}
{% endsnapshot %}
