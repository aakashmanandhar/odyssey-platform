-- One row per destination: Wikivoyage listing + resolved Wikidata ID + latest dated details.
with links as (
    select * from {{ ref('silver_destination_links') }}
),
pageprops as (
    select country_iso3,
           from_json(response_json,
             'struct<query:struct<normalized:array<struct<`from`:string,`to`:string>>,
                                 redirects:array<struct<`from`:string,`to`:string>>,
                                 pages:array<struct<title:string,pageprops:struct<wikibase_item:string>>>>>') as j
    from {{ ref('stg_wikivoyage_responses') }}
    where query_name = 'destination_pageprops'
),
normalized as (
    select country_iso3, n.`from` as from_title, n.`to` as to_title
    from pageprops lateral view explode(j.query.normalized) t as n
),
redirects as (
    select country_iso3, r.`from` as from_title, r.`to` as to_title
    from pageprops lateral view explode(j.query.redirects) t as r
),
pages as (
    select country_iso3, p.title, p.pageprops.wikibase_item as qid
    from pageprops lateral view explode(j.query.pages) t as p
),
resolved as (
    select l.country_iso3, l.kind, l.position_in_section, l.link_title,
           coalesce(r.to_title, n.to_title, l.link_title) as page_title
    from links l
    left join normalized n on n.country_iso3 = l.country_iso3 and n.from_title = l.link_title
    left join redirects r  on r.country_iso3 = l.country_iso3 and r.from_title = coalesce(n.to_title, l.link_title)
),
with_qid as (
    select r.*, p.qid
    from resolved r
    join pages p on p.country_iso3 = r.country_iso3 and p.title = r.page_title
    where p.qid is not null
),
details as (
    select country_iso3,
           regexp_extract(binding['item'].value, '(Q[0-9]+)$', 1)                                   as qid,
           binding['itemLabel'].value                                                                as name,
           cast(regexp_extract(binding['coord'].value, '^Point\\(([-0-9.eE]+) ', 1) as double)       as lon,
           cast(regexp_extract(binding['coord'].value, ' ([-0-9.eE]+)\\)$', 1) as double)             as lat,
           cast(cast(binding['population'].value as double) as bigint)                               as population,
           case when binding['popDate'].value rlike '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then try_to_date(substr(binding['popDate'].value, 1, 10)) end                                          as population_date,
           cast(binding['sitelinks'].value as int)                                                   as sitelinks,
           binding['types'].value                                                                    as types
    from {{ ref('stg_wikidata_bindings') }}
    where query_name = 'destination_details'
),
best_detail as (
    select * from details
    qualify row_number() over (partition by country_iso3, qid
                               order by population_date desc nulls last, population desc nulls last, lon nulls last) = 1
)
select
    w.country_iso3,
    w.qid                    as destination_qid,
    d.name,
    w.page_title             as wikivoyage_title,
    w.kind,
    w.position_in_section,
    d.lon,
    d.lat,
    d.population,
    d.population_date,
    d.sitelinks,
    case when d.types is null or d.types = '' then array() else split(d.types, ';') end as wikidata_types
from with_qid w
left join best_detail d on d.country_iso3 = w.country_iso3 and d.qid = w.qid
where d.types is null or not array_contains(split(d.types, ';'), 'Wikimedia list article')
qualify row_number() over (partition by w.country_iso3, w.qid
                           order by case w.kind when 'city' then 0 else 1 end, w.position_in_section) = 1
