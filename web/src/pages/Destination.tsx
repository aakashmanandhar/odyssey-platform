import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { DestinationFile, Highlight, IndexFile } from "../lib/types";
import { MONTHS_LONG, monthRanges, monthSet } from "../lib/months";
import { kindLabel, nf } from "../lib/format";
import { Credit, Img } from "../components/Img";
import { Icon } from "../components/Icon";
import { ClimateChart } from "../components/ClimateChart";
import { DestinationCard } from "../components/DestinationCard";
import { LoadError, Loading } from "../components/State";
import { Soon } from "./Soon";

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const TYPE: Record<string, string> = { landmark: "Landmark", mountain: "Mountain", waterbody: "Lake & water", glacier: "Glacier", river: "River", forest: "Forest" };
const CATEGORY: [string, string][] = [["see", "Sights"], ["do", "Things to do"], ["eat", "Food & drink"], ["stay", "Places to stay"], ["shop", "Shops"], ["other", "Other places"]];
const reveal = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.55 } };

function Facts({ d }: { d: DestinationFile }) {
  const ms = d.climate?.months ?? [];
  const by = (f: (m: (typeof ms)[number]) => number | null, dir: 1 | -1) =>
    ms.filter((m) => f(m) != null).sort((a, b) => dir * ((f(b) as number) - (f(a) as number)))[0];
  const warm = by((m) => m.temp_max_c, 1), wet = by((m) => m.rain_mm_month, 1);
  const places = Object.values(d.places_by_category ?? {}).reduce((a, b) => a + b, 0);
  const items = [
    { k: "Best time", v: monthRanges(monthSet(d.climate?.best_months)), s: "Comfortable weather" },
    { k: "Peak comfort", v: d.climate?.peak_comfort != null ? `${d.climate.peak_comfort}/100` : "–", s: "Best month's score" },
    warm && { k: "Warmest", v: `${Math.round(warm.temp_max_c ?? 0)}°C`, s: `${MONTHS_LONG[warm.month_num - 1]} daytime high` },
    wet && { k: "Wettest", v: `${Math.round(wet.rain_mm_month ?? 0)} mm`, s: `Rain in ${MONTHS_LONG[wet.month_num - 1]}` },
    { k: "Top sights", v: nf.format(d.highlights.length), s: "Ranked by popularity" },
    places > 0 && { k: "Places mapped", v: compact.format(places), s: "Food, stays, shops and more" },
  ].filter(Boolean) as { k: string; v: string; s: string }[];
  return (
    <div className="facts">
      {items.map((f, i) => (
        <motion.div key={f.k} className="fact" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
          <span className="k">{f.k}</span><span className="v">{f.v}</span><span className="s">{f.s}</span>
        </motion.div>
      ))}
    </div>
  );
}

function Insights({ d }: { d: DestinationFile }) {
  const ms = d.climate?.months ?? [];
  if (ms.length !== 12) return null;
  const pick = (f: (m: (typeof ms)[number]) => number, dir: 1 | -1) => [...ms].sort((a, b) => dir * (f(b) - f(a)))[0];
  const warm = pick((m) => m.temp_max_c ?? -99, 1), cool = pick((m) => m.temp_min_c ?? 99, -1);
  const wet = pick((m) => m.rain_mm_month ?? -1, 1), dry = pick((m) => m.rain_mm_month ?? 9999, -1);
  const rows = [
    ["sun", `Best: ${monthRanges(monthSet(d.climate?.best_months))}`, "The months marked Best or Good in the chart: comfort close to this place's most pleasant month."],
    ["arrow", `Warmest: ${MONTHS_LONG[warm.month_num - 1]}`, `Days up to ${Math.round(warm.temp_max_c ?? 0)}°C.`],
    ["moon", `Coolest nights: ${MONTHS_LONG[cool.month_num - 1]}`, `Down to ${Math.round(cool.temp_min_c ?? 0)}°C; pack a warm layer.`],
    ["info", `Wettest: ${MONTHS_LONG[wet.month_num - 1]}`, `About ${Math.round(wet.rain_mm_month ?? 0)} mm of rain; driest is ${MONTHS_LONG[dry.month_num - 1]} (${Math.round(dry.rain_mm_month ?? 0)} mm).`],
  ] as const;
  return (
    <ul className="insights">
      {rows.map(([icon, t, s]) => <li key={t}><span className="ic"><Icon name={icon} size={16} /></span><div><strong>{t}</strong><p>{s}</p></div></li>)}
    </ul>
  );
}

function HighlightCard({ h, maxViews, dest }: { h: Highlight; maxViews: number; dest: string }) {
  const kind = TYPE[h.wiki_type ?? ""] ?? (h.category === "do" ? "Activity" : "Sight");
  return (
    <article className="hl-card">
      <div className="hl-photo">
        {h.photo ? <Img photo={h.photo} size={800} alt={`${h.title}, ${dest}`} />
                 : <div className="ph failed"><div className="ph-fallback" aria-hidden="true">{h.title.slice(0, 1)}</div></div>}
        <span className="rank">{h.highlight_rank}</span>
      </div>
      <div className="hl-body">
        <h3>{h.title}</h3>
        {h.local_title && h.local_title !== h.title && <p className="local" lang="">{h.local_title}</p>}
        <div className="hl-meta">
          <span className="chip-soft">{kind}</span>
          {h.views_30d != null && <span className="pop" title={`${nf.format(h.views_30d)} Wikipedia views in the last 30 days`}>
            <span className="pop-bar"><i style={{ width: `${Math.max(6, (h.views_30d / maxViews) * 100)}%` }} /></span>{compact.format(h.views_30d)} views/mo</span>}
        </div>
        <div className="hl-links">
          {h.wikipedia_page_id && <a href={`https://en.wikipedia.org/?curid=${h.wikipedia_page_id}`} target="_blank" rel="noreferrer">Read more</a>}
          {h.lat != null && h.lon != null && <a href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}#map=16/${h.lat}/${h.lon}`} target="_blank" rel="noreferrer">Map</a>}
        </div>
      </div>
    </article>
  );
}

function Highlights({ d }: { d: DestinationFile }) {
  const [all, setAll] = useState(false);
  const list = all ? d.highlights : d.highlights.slice(0, 9);
  const maxViews = Math.max(1, ...d.highlights.map((h) => h.views_30d ?? 0));
  if (!d.highlights.length) return <p className="muted empty">We don't have verified sights for {d.destination.name} yet. Our filters leave a place empty rather than list stadiums or offices.</p>;
  return (
    <>
      <div className="hl-grid">
        <AnimatePresence initial={false}>
          {list.map((h, i) => (
            <motion.div key={h.title} layout initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 9) * 0.04 }}>
              <HighlightCard h={h} maxViews={maxViews} dest={d.destination.name} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {d.highlights.length > 9 && (
        <div className="center"><button className="btn ghost" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${d.highlights.length} sights`}</button></div>
      )}
    </>
  );
}

function Places({ d }: { d: DestinationFile }) {
  const rows = CATEGORY.filter(([k]) => k !== "other").map(([k, label]) => ({ label, v: d.places_by_category?.[k] ?? 0 }))
    .filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  const other = d.places_by_category?.other ?? 0;
  if (!rows.length) return null;
  const max = rows[0].v;
  return (
    <>
      <div className="pbars" role="list">
        {rows.map((r, i) => (
          <div key={r.label} className="pbar" role="listitem" aria-label={`${r.label}: ${nf.format(r.v)}`}>
            <span className="pl">{r.label}</span>
            <span className="pt"><motion.i initial={{ width: 0 }} whileInView={{ width: `${(r.v / max) * 100}%` }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }} /></span>
            <span className="pv">{nf.format(r.v)}</span>
          </div>
        ))}
      </div>
      {other > 0 && <p className="pnote">Plus {nf.format(other)} other mapped places, such as services, offices and transport.</p>}
    </>
  );
}

export default function Destination() {
  const { key } = useParams();
  const { data: d, error } = useJSON<DestinationFile>(key ? `destinations/${key}.json` : null);
  const { data: index } = useJSON<IndexFile>("index.json");
  const related = useMemo(() => index && d
    ? index.destinations.filter((x) => x.country_key === d.destination.country_key && x.key !== d.destination.destination_key && x.hero)
        .sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0)).slice(0, 4)
    : [], [index, d]);

  if (error) return error.includes("404") ? <Soon title="Destination not found" note="This link doesn't match any destination in the current data." /> : <LoadError message={error} />;
  if (!d) return <Loading label="Loading destination" />;
  const dest = d.destination, photo = d.hero ?? d.banner;
  const best = monthSet(d.climate?.best_months);

  return (
    <>
      <section className="wrap">
        <div className="dest-hero">
          {photo && <Img photo={photo} size={1600} alt={`${dest.name}, ${d.country.name}`} priority showCredit={false} />}
          {photo && <div className="dest-credit"><Credit photo={photo} down /></div>}
          <motion.div className="dest-hero-in" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.08 } } }}>
            <motion.nav className="crumbs" aria-label="Breadcrumb" variants={{ h: { opacity: 0 }, s: { opacity: 1 } }}>
              <Link to="/">Home</Link><span>/</span><Link to={`/c/${d.country.key}`}>{d.country.name}</Link>
            </motion.nav>
            <motion.h1 variants={{ h: { opacity: 0, y: 20 }, s: { opacity: 1, y: 0, transition: { duration: 0.6 } } }}>{dest.name}</motion.h1>
            <motion.div className="dest-chips" variants={{ h: { opacity: 0, y: 12 }, s: { opacity: 1, y: 0 } }}>
              <span className="dchip"><Icon name="pin" size={14} />{d.country.name} · {kindLabel(dest.kind)}</span>
              {best.size > 0 && <span className="dchip">Best time: {monthRanges(best)}</span>}
              {dest.population ? <span className="dchip">{compact.format(dest.population)} people</span> : null}
            </motion.div>
          </motion.div>
        </div>
      </section>

      <nav className="subnav" aria-label="On this page">
        <div className="wrap subnav-in">
          <a href="#overview">Overview</a>
          {d.climate && <a href="#when">When to go</a>}
          <a href="#sights">Top sights</a>
          {d.places_by_category && <a href="#places">Places</a>}
          {related.length > 0 && <a href="#nearby">More in {d.country.name}</a>}
        </div>
      </nav>

      <section id="overview" className="wrap anchor"><Facts d={d} /></section>

      {d.climate && (
        <section id="when" className="wrap sec anchor">
          <motion.div className="sec-hd" {...reveal}>
            <p className="eyebrow">When to go</p>
            <h2>The year in {dest.name}</h2>
            <p className="muted">Long-term climate averages, month by month. Hover or tap a month to see its details.</p>
          </motion.div>
          <div className="when-grid">
            <motion.div className="panel" {...reveal}><ClimateChart months={d.climate.months} /></motion.div>
            <motion.div className="panel" {...reveal}><Insights d={d} /></motion.div>
          </div>
          <p className="source">Temperature and rain: WorldClim 2.1 (1970–2000 averages). Humidity, cloud and wind: NASA POWER (2001–2025). Comfort scores 100 × (0.5 temperature + 0.35 dryness + 0.15 clear skies).</p>
        </section>
      )}

      <section id="sights" className="wrap sec anchor">
        <motion.div className="sec-hd" {...reveal}>
          <p className="eyebrow">Top sights</p>
          <h2>What to see in {dest.name}</h2>
          <p className="muted">Ranked by how many people read about each place, with a boost for good photos and places confirmed by two map sources.</p>
        </motion.div>
        <Highlights d={d} />
      </section>

      {d.places_by_category && (
        <section id="places" className="wrap sec anchor">
          <motion.div className="sec-hd" {...reveal}>
            <p className="eyebrow">Places</p>
            <h2>What's around</h2>
            <p className="muted">Places within reach of {dest.name}, matched across Overture Maps and Foursquare open data.</p>
          </motion.div>
          <motion.div className="panel" {...reveal}><Places d={d} /></motion.div>
        </section>
      )}

      {related.length > 0 && (
        <section id="nearby" className="wrap sec anchor">
          <motion.div className="sec-hd" {...reveal}><p className="eyebrow">Keep exploring</p><h2>More in {d.country.name}</h2></motion.div>
          <div className="grid">
            {related.map((r) => <DestinationCard key={r.key} d={r} country={d.country.name} />)}
          </div>
        </section>
      )}
    </>
  );
}
