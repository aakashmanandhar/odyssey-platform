import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { IndexDestination, IndexFile, TrustFile } from "../lib/types";
import { MONTHS, MONTHS_LONG, monthSet } from "../lib/months";
import { fmtDate, nf } from "../lib/format";
import { Credit, Img } from "../components/Img";
import { Icon } from "../components/Icon";
import { DestinationCard } from "../components/DestinationCard";
import { LoadError, Loading } from "../components/State";
import { useSearch } from "../components/Layout";

const rise = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } } };

function Hero({ index, trust }: { index: IndexFile; trust?: TrustFile }) {
  const { open } = useSearch();
  const countryName = useMemo(() => new Map(index.countries.map((c) => [c.key, c.name])), [index]);
  // One flagship destination per country, most highlights first
  const slides = useMemo(() => {
    const seen = new Set<string>();
    return [...index.destinations].filter((d) => d.hero)
      .sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0))
      .filter((d) => (seen.has(d.country_key) ? false : (seen.add(d.country_key), true)))
      .slice(0, 6);
  }, [index]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % slides.length), 7000);
    return () => window.clearInterval(t);
  }, [slides.length]);
  const s = slides[i];
  const counts = trust?.counts;

  return (
    <section className="wrap">
      <div className="hero">
        <div className="hero-bg">
          <AnimatePresence initial={false}>
            {s?.hero && (
              <motion.div key={s.key} className="hero-slide"
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1, transition: { opacity: { duration: 1.2 }, scale: { duration: 8, ease: "linear" } } }}
                exit={{ opacity: 0, transition: { duration: 1.2 } }}>
                <Img photo={s.hero} size={1600} alt={`${s.name}, ${countryName.get(s.country_key) ?? ""}`} priority showCredit={false} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {s?.hero && (
          <div className="hero-cap">
            <Link to={`/d/${s.key}`}><Icon name="pin" size={14} />{s.name}, {countryName.get(s.country_key)}</Link>
            <div className="dots">
              {slides.map((d, j) => (
                <button key={d.key} className={j === i ? "on" : ""} onClick={() => setI(j)} aria-label={`Show ${d.name}`} />
              ))}
            </div>
            <Credit photo={s.hero} down />
          </div>
        )}

        <motion.div className="hero-in" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}>
          <motion.p className="eyebrow" variants={rise}>Travel intelligence from open data</motion.p>
          <motion.h1 variants={rise}>Know where to go, and when.</motion.h1>
          <motion.p className="lead" variants={rise}>
            The best months, top sights and travel facts for {nf.format(index.destinations.length)} destinations
            in {index.countries.length} countries, from long-term climate records and live official sources.
          </motion.p>
          <motion.button variants={rise} className="hero-search" onClick={open}>
            <Icon name="search" /><span className="label">Search a city, region or country</span>
            <span className="go">Search <Icon name="arrow" size={16} /></span>
          </motion.button>
          <motion.div className="chips" variants={rise}>
            {slides.slice(0, 5).map((d) => <Link key={d.key} className="chip" to={`/d/${d.key}`}>{d.name}</Link>)}
          </motion.div>
          <motion.div className="hero-stats" variants={rise}>
            <span><b>{nf.format(index.destinations.length)}</b> destinations</span>
            {counts?.highlights != null && <span><b>{nf.format(counts.highlights)}</b> ranked sights</span>}
            {counts?.place_photos != null && <span><b>{nf.format(counts.place_photos + (counts.destination_photos ?? 0))}</b> credited photos</span>}
            {counts?.golden_places != null && <span><b>{(counts.golden_places / 1e6).toFixed(1)}M</b> places matched</span>}
            <span>Updated {fmtDate(index.generated_at)}</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// Destinations whose best months include `month`, most-loved first, at most 3 per country for variety
function rankForMonth(dests: IndexDestination[], month: number) {
  const matching = dests.filter((d) => monthSet(d.best_months).has(month));
  const ranked = matching.filter((d) => d.hero)
    .sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0) || (b.peak_comfort ?? 0) - (a.peak_comfort ?? 0));
  const perCountry = new Map<string, number>();
  const picks: IndexDestination[] = [];
  for (const d of ranked) {
    const n = perCountry.get(d.country_key) ?? 0;
    if (n >= 3) continue;
    perCountry.set(d.country_key, n + 1);
    picks.push(d);
    if (picks.length === 12) break;
  }
  return { picks, total: matching.length };
}

function MonthPicks({ index }: { index: IndexFile }) {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const countryName = useMemo(() => new Map(index.countries.map((c) => [c.key, c.name])), [index]);
  const { picks, total } = useMemo(() => rankForMonth(index.destinations, month), [index, month]);

  return (
    <section className="wrap sec">
      <motion.div className="sec-hd" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}>
        <p className="eyebrow">Where's great in…</p>
        <h2>The best places to be in {MONTHS_LONG[month - 1]}</h2>
        <p className="muted">
          Each destination's best months come from long-term climate averages: temperature, rainfall and cloud cover,
          scored for comfort. Pick a month to see where the weather is on your side.
        </p>
      </motion.div>

      <div className="months" role="tablist" aria-label="Choose a month">
        {MONTHS.map((m, i) => (
          <button key={m} role="tab" aria-selected={month === i + 1} className={month === i + 1 ? "on" : ""} onClick={() => setMonth(i + 1)}>
            {month === i + 1 && <motion.span layoutId="month-pill" className="pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span>{m}</span>
          </button>
        ))}
      </div>

      <motion.div className="grid" layout>
        <AnimatePresence mode="popLayout">
          {picks.map((d, i) => (
            <motion.div key={d.key} layout
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.035, duration: 0.45 } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}>
              <DestinationCard d={d} country={countryName.get(d.country_key)} month={month} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <div className="sec-more">
        <span>{total} of {index.destinations.length} destinations are at their best in {MONTHS_LONG[month - 1]}.</span>
        <Link className="link-arrow" to="/explore">See them all <Icon name="arrow" size={16} /></Link>
      </div>
    </section>
  );
}

export default function Home() {
  const { data: index, error } = useJSON<IndexFile>("index.json");
  const { data: trust } = useJSON<TrustFile>("trust.json");
  if (error) return <LoadError message={error} />;
  if (!index) return <Loading label="Loading destinations" />;
  return (<><Hero index={index} trust={trust} /><MonthPicks index={index} /></>);
}
