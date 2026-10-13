-- Destinations as listed on each Wikivoyage country page, in editorial order.
with pages as (
    select country_iso3, get_json_object(response_json, '$.parse.wikitext') as wikitext
    from {{ ref('stg_wikivoyage_responses') }}
    where query_name = 'country_page'
),
sections as (
    select country_iso3, 'city' as kind,
           regexp_extract(wikitext, '(?s)\\n==\\s*(?:Cities|Towns)[^=\\n]*==\\s*\\n(.*?)(?=\\n==[^=]|$)', 1) as section_text
    from pages
    union all
    select country_iso3, 'other_destination' as kind,
           regexp_extract(wikitext, '(?s)\\n==\\s*Other destinations\\s*==\\s*\\n(.*?)(?=\\n==[^=]|$)', 1) as section_text
    from pages
),
links as (
    select country_iso3, kind,
           posexplode(regexp_extract_all(section_text, '(?m)^[*#].*?\\[\\[([^\\]|#]+)', 1)) as (pos, link_title)
    from sections
)
select country_iso3, kind, pos + 1 as position_in_section, trim(link_title) as link_title
from links
