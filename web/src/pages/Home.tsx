import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { IndexDestination, IndexFile, TrustFile } from "../lib/types";
import { MONTHS, MONTHS_LONG, monthRanges, monthSet } from "../lib/months";
import { fmtDate, nf } from "../lib/format";
import { compact } from "../lib/chart";
import { Credit, Img } from "../components/Img";
import { Icon } from "../components/Icon";
import { MonthStrip } from "../components/MonthStrip";
import { Carousel } from "../components/Carousel";
import { LoadError, Loading } from "../components/State";
import { useSearch } from "../components/Layout";

const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.7, 0.2, 1] } } };

function rank(dests: IndexDestination[], month: number) {
  const matching = dests.filter((d) => monthSet(d.best_months).has(month));
  const ranked = matching.filter((d) => d.hero).sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0) || (b.peak_comfort ?? 0) - (a.peak_comfort ?? 0));
  const per = new Map<string, number>(), picks: IndexDestination[] = [];
  for (const d of ranked) { const n = per.get(d.country_key) ?? 0; if (n >= 2) continue; per.set(d.country_key, n + 1); picks.push(d); if (picks.length === 8) break; }
  return { picks, total: matching.length };
}

function Hero({ index, trust }: { index: IndexFile; trust?: TrustFile }) {
  const { open } = useSearch();
  const cname = useMemo(() => new Map(index.countries.map((c) => [c.key, c.name])), [index]);
  const slides = useMemo(() => { const seen = new Set<string>(); return [...index.destinations].filter((d) => d.hero).sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0))
    .filter((d) => (seen.has(d.country_key) ? false : (seen.add(d.country_key), true))).slice(0, 7); }, [index]);
  const [i, setI] = useState(0);
  useEffect(() => { if (slides.length < 2) return; const t = window.setInterval(() => setI((x) => (x + 1) % slides.length), 7000); return () => window.clearInterval(t); }, [slides.length]);
  const s = slides[i], c = trust?.counts;
  return (
    <div className="hero">
      <div className="hero-bg"><AnimatePresence initial={false}>{s?.hero && (
        <motion.div key={s.key} className="hero-slide" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1, transition: { opacity: { duration: 1.2 }, scale: { duration: 8, ease: "linear" } } }} exit={{ opacity: 0, transition: { duration: 1.2 } }}>
          <Img photo={s.hero} size={1600} alt={`${s.name}, ${cname.get(s.country_key) ?? ""}`} priority showCredit={false} />
        </motion.div>)}</AnimatePresence></div>
      {s?.hero && <div className="hero-cap"><Link to={`/d/${s.key}`}><Icon name="pin" size={14} />{s.name}, {cname.get(s.country_key)}</Link>
        <div className="dots">{slides.map((d, j) => <button key={d.key} className={j === i ? "on" : ""} onClick={() => setI(j)} aria-label={`Show ${d.name}`} />)}</div><Credit photo={s.hero} down /></div>}
      <motion.div className="hero-in" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
        <motion.p className="eyebrow" variants={rise}>Travel intelligence from open data</motion.p>
        <motion.h1 variants={rise}>Know where to go, and when.</motion.h1>
        <motion.button variants={rise} className="hero-search" onClick={open}><Icon name="search" /><span className="label">Search a city, region or country</span><span className="go">Search <Icon name="arrow" size={16} /></span></motion.button>
        <motion.div className="hero-stats" variants={rise}>
          <span><b>{nf.format(index.destinations.length)}</b> destinations</span><span><b>{index.countries.length}</b> countries</span>
          {c?.highlights != null && <span><b>{nf.format(c.highlights)}</b> sights</span>}
          {c?.golden_places != null && <span><b>{compact.format(c.golden_places)}</b> places</span>}
          <span>Updated {fmtDate(index.generated_at)}</span>
        </motion.div>
        <motion.p className="credit-line" variants={rise}>Designed and developed by <a href="https://aakashmanandhar.tech/" target="_blank" rel="noreferrer">Aakash Manandhar</a> · <a href="https://github.com/aakashmanandhar/odyssey-platform" target="_blank" rel="noreferrer">GitHub</a></motion.p>
      </motion.div>
    </div>
  );
}

function Picks({ index }: { index: IndexFile }) {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const cname = useMemo(() => new Map(index.countries.map((c) => [c.key, c.name])), [index]);
  const { picks, total } = useMemo(() => rank(index.destinations, month), [index, month]);
  return (
    <motion.section className="picks panel" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
      <div><p className="eyebrow">Where's great in…</p><h2>{MONTHS_LONG[month - 1]}</h2></div>
      <div className="mstrip" role="tablist" aria-label="Choose a month">
        {MONTHS.map((m, i) => <button key={m} role="tab" aria-selected={month === i + 1} className={month === i + 1 ? "on" : ""} onClick={() => setMonth(i + 1)}>
          {month === i + 1 && <motion.span layoutId="home-month" className="ms-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}<span>{m[0]}</span></button>)}
      </div>
      <ul className="picks-list">
        <AnimatePresence mode="popLayout" initial={false}>
          {picks.map((d, i) => (
            <motion.li key={d.key} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.03 } }} exit={{ opacity: 0, x: -12 }}>
              <Link className="pick" to={`/d/${d.key}`}>
                <span className="n">{i + 1}</span>
                <span className="th">{d.hero && <Img photo={d.hero} size={800} alt="" showCredit={false} />}</span>
                <span><b>{d.name}</b><span>{cname.get(d.country_key)} · best {monthRanges(monthSet(d.best_months))}</span>
                  <MonthStrip best={monthSet(d.best_months)} current={month} /></span>
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="picks-foot"><span>{total} destinations at their best</span><Link className="link-arrow" to="/explore">See all <Icon name="arrow" size={15} /></Link></div>
    </motion.section>
  );
}

function Countries({ index }: { index: IndexFile }) {
  const tone = (l: number | null | undefined) => (l == null ? "neutral" : l === 0 ? "ok" : l >= 2 ? "bad" : "warn");
  return (
    <motion.section className="strip" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <Carousel label="Countries">
        {[...index.countries].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
          <Link key={c.key} to={`/c/${c.key}`} className="ctile">
            {c.cover && <Img photo={c.cover} size={800} alt="" showCredit={false} />}
            <div className="ctile-in"><b>{c.name}</b><span><i className={`dot ${tone(c.advisory_level)}`} />{c.destinations ?? 0} destinations</span></div>
          </Link>
        ))}
      </Carousel>
    </motion.section>
  );
}

export default function Home() {
  const { data: index, error } = useJSON<IndexFile>("index.json");
  const { data: trust } = useJSON<TrustFile>("trust.json");
  if (error) return <LoadError message={error} />;
  if (!index) return <Loading label="Loading destinations" />;
  return <div className="page-fit home"><Hero index={index} trust={trust} /><Picks index={index} /><Countries index={index} /></div>;
}
