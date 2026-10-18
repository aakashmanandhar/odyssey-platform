import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { CountryFile, IndexFile } from "../lib/types";
import { fmtDate, nf } from "../lib/format";
import { compact } from "../lib/chart";
import { countryName, guessPassport, savePassport } from "../lib/countries";
import { Credit, Img } from "../components/Img";
import { Icon } from "../components/Icon";
import { StatusBadge, type Tone } from "../components/Status";
import { YearChart } from "../components/YearChart";
import { RateChart } from "../components/RateChart";
import { DestinationCard } from "../components/DestinationCard";
import { LoadError, Loading } from "../components/State";
import { Soon } from "./Soon";
import { Tabs } from "../components/Tabs";
import { Carousel } from "../components/Carousel";

const reveal = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.55 } };
const AA_URL = "https://www.auswaertiges-amt.de/de/ReiseUndSicherheit/reise-und-sicherheitshinweise";

export function advisoryStatus(a: CountryFile["advisory"], fallbackLabel?: string | null): { tone: Tone; title: string; text: string } {
  if (!a) return { tone: "neutral", title: "No advisory", text: fallbackLabel ?? "No advisory is published for this country by the German Foreign Office." };
  const text = a.advisory_label ?? "";
  if (a.warning) return { tone: "bad", title: "Travel warning", text };
  if (a.partial_warning) return { tone: "warn", title: "Partial travel warning", text };
  if (a.situation_warning || a.situation_part_warning) return { tone: "warn", title: "Safety notice", text };
  return { tone: "ok", title: "No travel warning", text };
}

const VISA: Record<string, { label: string; group: "easy" | "moderate" | "hard" }> = {
  visa_free: { label: "Visa-free", group: "easy" }, visa_exempt: { label: "Visa-free", group: "easy" },
  eta: { label: "Online travel authorisation (ETA)", group: "easy" },
  e_visa: { label: "eVisa (apply online)", group: "moderate" }, evisa: { label: "eVisa (apply online)", group: "moderate" },
  visa_on_arrival: { label: "Visa on arrival", group: "moderate" },
  visa_required: { label: "Visa required in advance", group: "hard" }, no_admission: { label: "Entry not permitted", group: "hard" },
};
const visaMeta = (c: string) => VISA[c] ?? { label: c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), group: "moderate" as const };
const HOW: Record<string, string> = {
  visa_free: "No visa needed for a short tourist stay.", visa_exempt: "No visa needed for a short tourist stay.",
  eta: "Register online before you travel; approval is usually quick.",
  e_visa: "Apply online before you travel.", evisa: "Apply online before you travel.",
  visa_on_arrival: "Get it on arrival at the airport or land border; bring a passport photo and the fee.",
  visa_required: "Apply at an embassy or consulate well before you travel.",
  no_admission: "Entry is not currently permitted for this passport.",
};
const GROUP: Record<string, { label: string; tone: Tone }> = { easy: { label: "Easy", tone: "ok" }, moderate: { label: "Paperwork on arrival or online", tone: "warn" }, hard: { label: "Visa needed in advance", tone: "bad" } };

function Visa({ c }: { c: CountryFile }) {
  const map = c.visa?.by_passport ?? {};
  const self = c.country.iso3 ?? c.country.country_key;
  const codes = useMemo(() => Object.keys(map).filter((k) => k !== self).sort((a, b) => countryName(a).localeCompare(countryName(b))), [map, self]);
  const [pp, setPp] = useState(() => guessPassport(codes));
  if (!codes.length) return null;
  const rule = map[pp], meta = rule ? visaMeta(rule.category) : null;
  const counts = { easy: 0, moderate: 0, hard: 0 } as Record<string, number>;
  codes.forEach((k) => { counts[visaMeta(map[k].category).group]++; });
  return (
    <div className="visa">
      <div className="visa-check">
        <label htmlFor="pp">Your passport</label>
        <select id="pp" value={pp} onChange={(e) => { setPp(e.target.value); savePassport(e.target.value); }}>
          {codes.map((k) => <option key={k} value={k}>{countryName(k)}</option>)}
        </select>
        {meta && (
          <motion.div key={pp} className="visa-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <StatusBadge tone={GROUP[meta.group].tone} label={meta.label} />
            <p>{rule.days ? `Stay up to ${rule.days} days.` : HOW[rule.category] ?? "Check the allowed length of stay before you travel."}</p>
          </motion.div>
        )}
      </div>
      <div className="visa-dist">
        <p className="k">Across {codes.length} passports</p>
        <div className="stack" role="img" aria-label={Object.entries(counts).map(([g, n]) => `${GROUP[g].label}: ${n}`).join(", ")}>
          {(["easy", "moderate", "hard"] as const).filter((g) => counts[g]).map((g, i) => (
            <motion.i key={g} className={`seg ${GROUP[g].tone}`} initial={{ flexGrow: 0 }} whileInView={{ flexGrow: counts[g] }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.7 }} />
          ))}
        </div>
        <ul className="stack-legend">
          {(["easy", "moderate", "hard"] as const).map((g) => <li key={g}><i className={`sw ${GROUP[g].tone}`} />{GROUP[g].label}<b>{counts[g]}</b></li>)}
        </ul>
        {c.visa?.as_of && <p className="source">Entry rules as of {fmtDate(c.visa.as_of)}. Always confirm with the embassy before you travel.</p>}
      </div>
    </div>
  );
}

function Holidays({ c }: { c: CountryFile }) {
  const [all, setAll] = useState(false);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = (c.holidays_next_12_months ?? []).map((h) => ({ ...h, d: new Date(h.holiday_date + "T00:00:00") })).filter((h) => h.d >= today).sort((a, b) => +a.d - +b.d);
  if (!list.length) return <p className="muted">No public holidays listed for the next 12 months.</p>;
  const shown = all ? list : list.slice(0, 8);
  const days = (d: Date) => Math.round((+d - +today) / 864e5);
  return (
    <>
      <ul className="hols">
        {shown.map((h, i) => (
          <li key={h.holiday_date + h.holiday_name} className={i === 0 ? "next" : ""}>
            <span className="hd"><b>{h.d.getDate()}</b>{h.d.toLocaleDateString("en-GB", { month: "short" })}</span>
            <span className="hn">{h.holiday_name}</span>
            <span className="hin">{days(h.d) === 0 ? "today" : days(h.d) === 1 ? "tomorrow" : `in ${days(h.d)} days`}</span>
          </li>
        ))}
      </ul>
      {list.length > 8 && <div className="center"><button className="btn ghost" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${list.length}`}</button></div>}
    </>
  );
}

type CTab = "glance" | "money" | "holidays" | "tourism" | "destinations";

export default function Country() {
  const { key } = useParams();
  const { data: c, error } = useJSON<CountryFile>(key ? `countries/${key}.json` : null);
  const { data: index } = useJSON<IndexFile>("index.json");
  const [tab, setTab] = useState<CTab>("glance");
  if (error) return error.includes("404") ? <Soon title="Country not found" note="This link doesn't match any country in the current data." /> : <LoadError message={error} />;
  if (!c) return <Loading label="Loading country" />;
  const ic = index?.countries.find((x) => x.key === c.country.country_key);
  const cover = ic?.cover ?? c.destinations.find((d) => d.hero)?.hero;
  const p = c.profile, adv = advisoryStatus(c.advisory, ic?.advisory_label);
  const cur = c.money?.currency ?? p?.primary_currency ?? "";
  const rate = c.money?.current?.rate_per_eur ?? p?.rate_per_eur;
  const pop = p?.population ?? c.country.population;
  const dests = [...c.destinations].sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0));
  const hols = c.holidays_next_12_months?.length ?? 0;
  const tourism = (c.tourism ?? []).map((t) => ({
    year: t.year, value: t.arrivals ?? null, muted: !!t.is_pandemic_year,
    detail: [["Visitors", t.arrivals != null ? compact.format(t.arrivals) : "–"], ["Spending", t.receipts_usd != null ? `$${compact.format(t.receipts_usd)}` : "–"],
             ["Per visitor", t.receipts_per_arrival_usd != null ? `$${nf.format(Math.round(t.receipts_per_arrival_usd))}` : "–"]] as [string, string][],
  }));
  const facts = [
    c.country.capital && { k: "Capital", v: c.country.capital, s: c.country.region ?? "" },
    pop && { k: "Population", v: compact.format(pop), s: p?.population_year ? `${p.population_year} estimate` : "" },
    c.country.area_km2 && { k: "Area", v: `${compact.format(c.country.area_km2)} km²`, s: "Land and water" },
    c.country.official_languages?.length && { k: "Language", v: c.country.official_languages.slice(0, 2).join(", "), s: "Official" },
    rate && cur && cur !== "EUR" && { k: "Money", v: `1 € = ${rate.toLocaleString("en-GB", { maximumFractionDigits: rate < 10 ? 3 : 2 })} ${cur}`, s: c.money?.current?.is_daily ? "ECB daily rate" : "Annual average rate" },
    cur === "EUR" && { k: "Money", v: "Euro (€)", s: "No exchange needed in the eurozone" },
    p?.price_level_ratio && { k: "Price level", v: `${Math.round(p.price_level_ratio * 100)}% of US`, s: `World Bank, ${p.price_level_year ?? ""}` },
  ].filter(Boolean) as { k: string; v: string; s: string }[];
  const tabs = [
    { key: "glance" as const, label: "At a glance" },
    ...(cur ? [{ key: "money" as const, label: "Money" }] : []),
    ...(hols ? [{ key: "holidays" as const, label: "Holidays", count: hols }] : []),
    ...(tourism.length > 1 ? [{ key: "tourism" as const, label: "Tourism" }] : []),
    { key: "destinations" as const, label: "Destinations", count: dests.length },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : "glance";

  return (
    <div className="page-fit dpage cpage">
      <section className="dtop">
        <motion.div className="dest-hero compact" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          {cover && <Img photo={cover} size={1600} alt={c.country.country_name} priority showCredit={false} />}
          {cover && <div className="dest-credit"><Credit photo={cover} down /></div>}
          <div className="dest-hero-in">
            <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><Link to="/countries">Countries</Link></nav>
            <h1>{c.country.country_name}</h1>
            <div className="dest-chips">
              <StatusBadge tone={adv.tone} label={adv.title} onPhoto />
              {c.country.region && <span className="dchip"><Icon name="globe" size={14} />{c.country.region}</span>}
              {c.country.capital && <span className="dchip">Capital {c.country.capital}</span>}
              <span className="dchip">{dests.length} destinations</span>
            </div>
          </div>
        </motion.div>
        <motion.aside className="panel planner-wrap entry" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <div className="pl-head"><span className="eyebrow">Entry check</span><span className="muted small0">Visa by passport</span></div>
          <Visa c={c} />
        </motion.aside>
      </section>

      <div className="tabbar-wrap"><Tabs id="country" tabs={tabs} active={active} onChange={setTab} /></div>

      <section className="tabpanel">
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            {active === "glance" && (
              <div className="glance">
                <div className="facts tight">{facts.map((f, i) => (
                  <motion.div key={f.k} className="fact" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <span className="k">{f.k}</span><span className="v">{f.v}</span><span className="s">{f.s}</span>
                  </motion.div>))}</div>
                <div className="panel adv-card">
                  <h3 className="ph3">Official travel advice</h3>
                  <StatusBadge tone={adv.tone} label={adv.title} />
                  <p className="adv-text">{adv.text}</p>
                  {c.advisory && <p className="source">{c.advisory.issuer}{c.advisory.effective_at ? `, in effect since ${fmtDate(c.advisory.effective_at)}` : ""}. <a href={AA_URL} target="_blank" rel="noreferrer">Official source</a></p>}
                </div>
              </div>
            )}
            {active === "money" && (
              <div className="panel">
                {cur === "EUR" ? <p className="muted">{c.country.country_name} uses the euro, so there's no exchange rate to watch from the eurozone.</p>
                  : (c.money?.series_120d?.length ?? 0) > 4 ? <RateChart series={c.money!.series_120d!} currency={cur} />
                  : <p className="muted">{cur} isn't published by the European Central Bank, so there's no daily trend. The rate shown is the World Bank annual average{c.money?.current?.rate_as_of ? ` (${new Date(c.money.current.rate_as_of).getFullYear()})` : ""}, converted to euros.</p>}
              </div>
            )}
            {active === "holidays" && <div className="panel hol-panel"><Holidays c={c} /></div>}
            {active === "tourism" && <div className="panel"><YearChart rows={tourism} title="International visitors" mutedLabel="Pandemic year" /></div>}
            {active === "destinations" && <Carousel label={`Destinations in ${c.country.country_name}`}>{dests.map((d) => <DestinationCard key={d.key} d={{ ...d, country_key: c.country.country_key }} country={c.country.country_name} />)}</Carousel>}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
