import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { ClimateMonth, DestinationFile, Highlight, IndexFile } from "../lib/types";
import { MONTHS, MONTHS_LONG, monthRanges, monthSet } from "../lib/months";
import { kindLabel, nf } from "../lib/format";
import { compact } from "../lib/chart";
import { Credit, Img } from "../components/Img";
import { Icon } from "../components/Icon";
import { ClimateChart, season } from "../components/ClimateChart";
import { ComfortGauge } from "../components/ComfortGauge";
import { Tabs } from "../components/Tabs";
import { Carousel } from "../components/Carousel";
import { DestinationCard } from "../components/DestinationCard";
import { LoadError, Loading } from "../components/State";
import { Soon } from "./Soon";

const TYPE: Record<string, string> = { landmark: "Landmark", mountain: "Mountain", waterbody: "Lake & water", glacier: "Glacier", river: "River", forest: "Forest" };
const NATURE = new Set(["mountain", "waterbody", "glacier", "river", "forest"]);
const CATEGORY: [string, string][] = [["see", "Sights"], ["do", "Things to do"], ["eat", "Food & drink"], ["stay", "Places to stay"], ["shop", "Shops"]];
type TabKey = "when" | "sights" | "around" | "nearby";

function verdict(m: ClimateMonth, name: string) {
  const s = m.season_label, t = m.temp_max_c ?? m.temp_mean_c, rain = m.rain_mm_month;
  const feel = t == null ? "" : t >= 30 ? "hot days" : t >= 24 ? "warm days" : t >= 15 ? "mild days" : t >= 5 ? "cool days" : "cold days";
  const wet = rain == null ? "" : rain < 30 ? "dry" : rain < 100 ? "some rain" : rain < 250 ? "rainy" : "very wet";
  const lead = s === "best" ? `One of the best months in ${name}` : s === "good" ? `A good time for ${name}` : `Not the ideal time for ${name}`;
  return `${lead}: ${[feel, wet].filter(Boolean).join(", ")}.`;
}

function Planner({ d, month, setMonth }: { d: DestinationFile; month: number; setMonth: (m: number) => void }) {
  const ms = d.climate?.months ?? [];
  const m = ms.find((x) => x.month_num === month);
  if (!m) return null;
  const s = season(m.season_label);
  return (
    <div className="planner">
      <div className="pl-head"><span className="eyebrow">Month planner</span><span className="muted small0">Best: {monthRanges(monthSet(d.climate?.best_months))}</span></div>
      <div className="mstrip" role="tablist" aria-label="Choose a month">
        {MONTHS.map((lbl, i) => {
          const mm = ms.find((x) => x.month_num === i + 1);
          return (
            <button key={lbl} role="tab" aria-selected={month === i + 1} className={`${month === i + 1 ? "on " : ""}${season(mm?.season_label ?? null).cls}`} onClick={() => setMonth(i + 1)}>
              {month === i + 1 && <motion.span layoutId="mstrip-pill" className="ms-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span>{lbl[0]}</span>
            </button>
          );
        })}
      </div>
      <div className="pl-body">
        <ComfortGauge value={m.comfort_score} cls={s.cls} label={s.label} />
        <div className="pl-side">
          <h3>{MONTHS_LONG[month - 1]}</h3>
          <span className={`pill ${s.cls}`}>{s.label}</span>
          <AnimatePresence mode="wait"><motion.p key={month} className="verdict" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{verdict(m, d.destination.name)}</motion.p></AnimatePresence>
        </div>
      </div>
      <div className="pstats">
        <div><span>Day</span><b>{m.temp_max_c != null ? `${Math.round(m.temp_max_c)}°` : "–"}</b></div>
        <div><span>Night</span><b>{m.temp_min_c != null ? `${Math.round(m.temp_min_c)}°` : "–"}</b></div>
        <div><span>Rain</span><b>{m.rain_mm_month != null ? `${Math.round(m.rain_mm_month)}` : "–"}<small>mm</small></b></div>
        <div><span>Humid</span><b>{m.humidity_pct != null ? `${Math.round(m.humidity_pct)}` : "–"}<small>%</small></b></div>
      </div>
    </div>
  );
}

function HighlightCard({ h, maxViews, dest }: { h: Highlight; maxViews: number; dest: string }) {
  const kind = TYPE[h.wiki_type ?? ""] ?? (h.category === "do" ? "Activity" : "Sight");
  return (
    <article className="hl-card">
      <div className="hl-photo">
        {h.photo ? <Img photo={h.photo} size={800} alt={`${h.title}, ${dest}`} /> : <div className="ph failed"><div className="ph-fallback" aria-hidden="true">{h.title.slice(0, 1)}</div></div>}
        <span className="rank">{h.highlight_rank}</span>
      </div>
      <div className="hl-body">
        <h3>{h.title}</h3>
        {h.local_title && h.local_title !== h.title && <p className="local">{h.local_title}</p>}
        <div className="hl-meta">
          <span className="chip-soft">{kind}</span>
          {h.views_30d != null && <span className="pop" title={`${nf.format(h.views_30d)} Wikipedia views in 30 days`}><span className="pop-bar"><i style={{ width: `${Math.max(6, (h.views_30d / maxViews) * 100)}%` }} /></span>{compact.format(h.views_30d)}/mo</span>}
        </div>
        <div className="hl-links">
          {h.wikipedia_page_id && <a href={`https://en.wikipedia.org/?curid=${h.wikipedia_page_id}`} target="_blank" rel="noreferrer">Read</a>}
          {h.lat != null && h.lon != null && <a href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}#map=16/${h.lat}/${h.lon}`} target="_blank" rel="noreferrer">Map</a>}
        </div>
      </div>
    </article>
  );
}

function Sights({ d }: { d: DestinationFile }) {
  const groups = useMemo(() => {
    const g = [
      { key: "all", label: "All", f: (_: Highlight) => true },
      { key: "landmark", label: "Landmarks", f: (h: Highlight) => !NATURE.has(h.wiki_type ?? "") && h.category !== "do" },
      { key: "nature", label: "Nature", f: (h: Highlight) => NATURE.has(h.wiki_type ?? "") },
      { key: "do", label: "Activities", f: (h: Highlight) => h.category === "do" && !NATURE.has(h.wiki_type ?? "") },
    ];
    return g.map((x) => ({ ...x, n: d.highlights.filter(x.f).length })).filter((x) => x.key === "all" || x.n > 0);
  }, [d]);
  const [g, setG] = useState("all");
  const list = d.highlights.filter(groups.find((x) => x.key === g)?.f ?? (() => true));
  const maxViews = Math.max(1, ...d.highlights.map((h) => h.views_30d ?? 0));
  if (!d.highlights.length) return <p className="muted empty">No verified sights for {d.destination.name} yet. Our filters leave a place empty rather than list stadiums or offices.</p>;
  return (
    <>
      {groups.length > 2 && <div className="filters">{groups.map((x) => <button key={x.key} className={g === x.key ? "on" : ""} onClick={() => setG(x.key)}>{x.label}<em>{x.n}</em></button>)}</div>}
      <Carousel label="Top sights">{list.map((h) => <HighlightCard key={h.title} h={h} maxViews={maxViews} dest={d.destination.name} />)}</Carousel>
    </>
  );
}

function Around({ d }: { d: DestinationFile }) {
  const rows = CATEGORY.map(([k, label]) => ({ label, v: d.places_by_category?.[k] ?? 0 })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  const other = d.places_by_category?.other ?? 0;
  const total = Object.values(d.places_by_category ?? {}).reduce((a, b) => a + b, 0);
  if (!rows.length) return <p className="muted">No mapped places for this destination yet.</p>;
  const max = rows[0].v;
  return (
    <div className="around">
      <div className="around-big"><b>{compact.format(total)}</b><span>places mapped around {d.destination.name}, matched across Overture Maps and Foursquare open data</span></div>
      <div className="pbars">
        {rows.map((r, i) => (
          <div key={r.label} className="pbar" aria-label={`${r.label}: ${nf.format(r.v)}`}>
            <span className="pl">{r.label}</span>
            <span className="pt"><motion.i initial={{ width: 0 }} animate={{ width: `${(r.v / max) * 100}%` }} transition={{ delay: i * 0.06, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }} /></span>
            <span className="pv">{nf.format(r.v)}</span>
          </div>
        ))}
        {other > 0 && <p className="pnote">Plus {nf.format(other)} other places: services, offices and transport.</p>}
      </div>
    </div>
  );
}

export default function Destination() {
  const { key } = useParams();
  const { data: d, error } = useJSON<DestinationFile>(key ? `destinations/${key}.json` : null);
  const { data: index } = useJSON<IndexFile>("index.json");
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [tab, setTab] = useState<TabKey>(d?.climate ? "when" : "sights");
  const related = useMemo(() => index && d ? index.destinations.filter((x) => x.country_key === d.destination.country_key && x.key !== d.destination.destination_key && x.hero)
    .sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0)).slice(0, 10) : [], [index, d]);

  if (error) return error.includes("404") ? <Soon title="Destination not found" note="This link doesn't match any destination in the current data." /> : <LoadError message={error} />;
  if (!d) return <Loading label="Loading destination" />;
  const dest = d.destination, photo = d.hero ?? d.banner, best = monthSet(d.climate?.best_months);
  const places = Object.values(d.places_by_category ?? {}).reduce((a, b) => a + b, 0);
  const tabs = [
    ...(d.climate ? [{ key: "when" as const, label: "When to go" }] : []),
    { key: "sights" as const, label: "Top sights", count: d.highlights.length },
    ...(d.places_by_category ? [{ key: "around" as const, label: "What's around" }] : []),
    ...(related.length ? [{ key: "nearby" as const, label: `More in ${d.country.name}` }] : []),
  ];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="page-fit dpage">
      <section className="dtop">
        <motion.div className="dest-hero compact" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          {photo && <Img photo={photo} size={1600} alt={`${dest.name}, ${d.country.name}`} priority showCredit={false} />}
          {photo && <div className="dest-credit"><Credit photo={photo} down /></div>}
          <div className="dest-hero-in">
            <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><Link to={`/c/${d.country.key}`}>{d.country.name}</Link></nav>
            <h1>{dest.name}</h1>
            <div className="dest-chips">
              <span className="dchip"><Icon name="pin" size={14} />{kindLabel(dest.kind)}</span>
              {best.size > 0 && <span className="dchip">Best: {monthRanges(best)}</span>}
              {dest.population ? <span className="dchip">{compact.format(dest.population)} people</span> : null}
              {d.highlights.length > 0 && <span className="dchip">{d.highlights.length} top sights</span>}
              {places > 0 && <span className="dchip">{compact.format(places)} places</span>}
            </div>
          </div>
        </motion.div>
        {d.climate && <motion.aside className="panel planner-wrap" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}><Planner d={d} month={month} setMonth={setMonth} /></motion.aside>}
      </section>

      <div className="tabbar-wrap"><Tabs id="dest" tabs={tabs} active={activeTab} onChange={setTab} /></div>

      <section className="tabpanel">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            {activeTab === "when" && d.climate && (
              <div className="panel">
                <ClimateChart months={d.climate.months} month={month} onMonth={setMonth} />
                <p className="source">Temperature and rain: WorldClim 2.1 (1970–2000). Humidity and cloud: NASA POWER (2001–2025). Comfort = 100 × (0.5 temperature + 0.35 dryness + 0.15 clear skies).</p>
              </div>
            )}
            {activeTab === "sights" && <Sights d={d} />}
            {activeTab === "around" && <div className="panel"><Around d={d} /></div>}
            {activeTab === "nearby" && <Carousel label={`More in ${d.country.name}`}>{related.map((r) => <DestinationCard key={r.key} d={r} country={d.country.name} month={month} />)}</Carousel>}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
