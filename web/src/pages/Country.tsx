import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { CountryFile, IndexFile } from "../lib/types";
import { fmtDate, nf } from "../lib/format";
import { compact } from "../lib/chart";
import { MONTHS } from "../lib/months";
import { countryName, flag, guessPassport, savePassport } from "../lib/countries";
import { Credit, Img } from "../components/Img";
import { Icon, type IconName } from "../components/Icon";
import { StatusBadge, type Tone } from "../components/Status";
import { YearChart } from "../components/YearChart";
import { RateChart, ratePoints } from "../components/RateChart";
import { PassportPicker } from "../components/PassportPicker";
import { DestTile } from "../components/DestTile";
import { LoadError, Loading } from "../components/State";
import { Soon } from "./Soon";
import { Tabs } from "../components/Tabs";

const AA_URL = "https://www.auswaertiges-amt.de/de/ReiseUndSicherheit/reise-und-sicherheitshinweise";

export function advisoryStatus(a: CountryFile["advisory"], fallbackLabel?: string | null): { tone: Tone; title: string; text: string } {
  if (!a) return { tone: "neutral", title: "No advisory", text: fallbackLabel ?? "No advisory is published for this country by the German Foreign Office." };
  const text = a.advisory_label ?? "";
  if (a.warning) return { tone: "bad", title: "Travel warning", text };
  if (a.partial_warning) return { tone: "warn", title: "Partial travel warning", text };
  if (a.situation_warning || a.situation_part_warning) return { tone: "warn", title: "Safety notice", text };
  return { tone: "ok", title: "No travel warning", text };
}

const VISA: Record<string, { label: string; short: string; group: "easy" | "moderate" | "hard" }> = {
  visa_free: { label: "Visa-free", short: "Visa-free", group: "easy" }, visa_exempt: { label: "Visa-free", short: "Visa-free", group: "easy" },
  eta: { label: "Online travel authorisation (ETA)", short: "ETA", group: "easy" },
  e_visa: { label: "eVisa (apply online)", short: "eVisa", group: "moderate" }, evisa: { label: "eVisa (apply online)", short: "eVisa", group: "moderate" },
  visa_on_arrival: { label: "Visa on arrival", short: "On arrival", group: "moderate" },
  visa_required: { label: "Visa required in advance", short: "Visa needed", group: "hard" }, no_admission: { label: "Entry not permitted", short: "No entry", group: "hard" },
};
const visaMeta = (c: string) => VISA[c] ?? { label: c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), short: "Check", group: "moderate" as const };
const HOW: Record<string, string> = {
  visa_free: "No visa needed for a short tourist stay.", visa_exempt: "No visa needed for a short tourist stay.",
  eta: "Register online before you travel; approval is usually quick.",
  e_visa: "Apply online before you travel.", evisa: "Apply online before you travel.",
  visa_on_arrival: "Get it at the airport or land border; bring a photo and the fee.",
  visa_required: "Apply at an embassy or consulate well before you travel.",
  no_admission: "Entry is not currently permitted for this passport.",
};
const QUICK = ["USA", "GBR", "IND", "CHN", "AUS", "BRA", "NGA", "JPN", "DEU", "FRA", "CAN", "MEX", "ZAF", "NPL"];
const GROUP: Record<string, { label: string; short: string; tone: Tone; icon: IconName }> = {
  easy: { label: "Easy", short: "Easy", tone: "ok", icon: "check" },
  moderate: { label: "Paperwork on arrival or online", short: "Paperwork", tone: "warn", icon: "days" },
  hard: { label: "Visa needed in advance", short: "Visa needed", tone: "bad", icon: "alert" },
};

function Visa({ c }: { c: CountryFile }) {
  const map = c.visa?.by_passport ?? {};
  const self = c.country.iso3 ?? c.country.country_key;
  const codes = useMemo(() => Object.keys(map).filter((k) => k !== self).sort((a, b) => countryName(a).localeCompare(countryName(b))), [map, self]);
  const [pp, setPp] = useState(() => guessPassport(codes));
  if (!codes.length) return <p className="muted">No entry rules are published for this country yet.</p>;
  const rule = map[pp], meta = rule ? visaMeta(rule.category) : null, g = meta ? GROUP[meta.group] : null;
  const counts = { easy: 0, moderate: 0, hard: 0 } as Record<string, number>;
  codes.forEach((k) => { counts[visaMeta(map[k].category).group]++; });
  const result = (k: string) => { const m = visaMeta(map[k].category); return { tone: GROUP[m.group].tone, short: m.short }; };
  const quick = QUICK.filter((k) => k !== pp && map[k]).slice(0, 7);
  const choose = (k: string) => { setPp(k); savePassport(k); };
  return (
    <div className="visa2">
      <PassportPicker codes={codes} value={pp} onChange={choose} result={result} />
      <AnimatePresence mode="wait">
        {meta && g && (
          <motion.div key={pp} className={`verdict-card ${g.tone}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <span className="vc-ic"><Icon name={g.icon} size={22} /></span>
            <span className="vc-txt"><b>{meta.label}</b><span>{HOW[rule.category] ?? "Check the rules before you travel."}</span></span>
            {rule.days ? <span className="vc-days"><b>{rule.days}</b><span>days</span></span> : null}
          </motion.div>
        )}
      </AnimatePresence>
      {quick.length > 2 && (
        <div className="quick" aria-label="Quick check other passports">
          <span className="k">Quick check</span>
          {quick.map((k) => { const r = result(k); return (
            <button key={k} className={`qchip ${r.tone}`} onClick={() => choose(k)} title={`${countryName(k)}: ${r.short}`} aria-label={`${countryName(k)}: ${r.short}`}>
              <span aria-hidden="true">{flag(k)}</span><i />
            </button>); })}
        </div>
      )}
      <div className="visa-dist2">
        <p className="k">How {codes.length} passports get in</p>
        <div className="stack" role="img" aria-label={Object.entries(counts).map(([k, n]) => `${GROUP[k].label}: ${n}`).join(", ")}>
          {(["easy", "moderate", "hard"] as const).filter((k) => counts[k]).map((k, i) => (
            <motion.i key={k} className={`seg ${GROUP[k].tone}`} initial={{ flexGrow: 0 }} animate={{ flexGrow: counts[k] }} transition={{ delay: 0.15 + i * 0.1, duration: 0.7 }} />
          ))}
        </div>
        <div className="dist-row">
          {(["easy", "moderate", "hard"] as const).map((k) => (
            <span key={k} title={GROUP[k].label}><b>{counts[k]}</b><em><i className={`sw ${GROUP[k].tone}`} />{GROUP[k].short}</em></span>
          ))}
        </div>
        {c.visa?.as_of && <p className="source">Rules as of {fmtDate(c.visa.as_of)}. Confirm with the embassy before you travel.</p>}
      </div>
    </div>
  );
}

const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const upcoming = (c: CountryFile) => {
  const t = today0();
  return (c.holidays_next_12_months ?? []).map((h) => ({ ...h, d: new Date(h.holiday_date + "T00:00:00") })).filter((h) => h.d >= t).sort((a, b) => +a.d - +b.d);
};
const inDays = (d: Date) => { const n = Math.round((+d - +today0()) / 864e5); return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`; };

function Holidays({ c }: { c: CountryFile }) {
  const list = upcoming(c);
  if (!list.length) return <div className="panel fill center-msg"><p className="muted">No public holidays listed for the next 12 months.</p></div>;
  const start = today0(), m0 = start.getMonth();
  const pos = (d: Date) => (((d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - m0) + (d.getDate() - 1) / 31) / 12 * 100;
  return (
    <div className="hol-wrap">
      <div className="panel hol-time">
        <div className="ht-months">{Array.from({ length: 12 }, (_, i) => <span key={i}>{MONTHS[(m0 + i) % 12]}</span>)}</div>
        <div className="ht-track">
          {list.map((h, i) => (
            <motion.i key={h.holiday_date + h.holiday_name} className={i === 0 ? "next" : ""} style={{ left: `${Math.min(99, pos(h.d))}%` }} title={`${h.holiday_name}, ${h.d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 + i * 0.03 }} />
          ))}
        </div>
      </div>
      <ul className="hol-grid">
        {list.map((h, i) => (
          <motion.li key={h.holiday_date + h.holiday_name} className={i === 0 ? "next" : ""} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 14) * 0.03 }}>
            <span className="hd"><b>{h.d.getDate()}</b>{h.d.toLocaleDateString("en-GB", { month: "short" })}</span>
            <span className="hx"><span className="hn">{h.holiday_name}</span><span className="hin">{h.d.toLocaleDateString("en-GB", { weekday: "long" })} · {inDays(h.d)}</span></span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function Spark({ values, cls = "" }: { values: number[]; cls?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), W = 100, H = 32;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 4)}`).join(" ");
  return <svg className={`spark ${cls}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="spark-clip"><motion.rect x="0" y="0" height={H} initial={{ width: 0 }} animate={{ width: W }} transition={{ duration: 1, ease: "easeOut" }} /></clipPath></defs>
    <polyline points={pts} clipPath="url(#spark-clip)" /></svg>;
}

function Kpis({ items }: { items: { k: string; v: string; s?: string; tone?: string }[] }) {
  return (
    <div className="kpis">
      {items.map((x, i) => (
        <motion.div key={x.k} className="kpi" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.05 }}>
          <span className="k">{x.k}</span><b className={x.tone ?? ""}>{x.v}</b>{x.s && <span className="s">{x.s}</span>}
        </motion.div>
      ))}
    </div>
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
  const hols = upcoming(c);
  const pts = ratePoints(c.money?.series_120d ?? []);
  const hasMoney = cur !== "EUR" && pts.length > 4;
  const tRows = (c.tourism ?? []).filter((t) => t.arrivals != null).sort((a, b) => a.year - b.year);
  const tourism = tRows.map((t) => ({
    year: t.year, value: t.arrivals ?? null, muted: !!t.is_pandemic_year,
    detail: [["Visitors", t.arrivals != null ? compact.format(t.arrivals) : "–"], ["Spending", t.receipts_usd != null ? `$${compact.format(t.receipts_usd)}` : "–"],
             ["Per visitor", t.receipts_per_arrival_usd != null ? `$${nf.format(Math.round(t.receipts_per_arrival_usd))}` : "–"]] as [string, string][],
  }));
  const last = tRows[tRows.length - 1], y2019 = tRows.find((t) => t.year === 2019), peak = tRows.reduce<typeof last | undefined>((a, t) => (!a || (t.arrivals ?? 0) > (a.arrivals ?? 0) ? t : a), undefined);
  const recovery = last && y2019?.arrivals ? Math.round(((last.arrivals ?? 0) / y2019.arrivals) * 100) : null;
  const priceRatio = p?.price_level_ratio ?? null;
  const facts: { k: string; v: string; s: string; icon: IconName; meter?: number }[] = [
    c.country.capital ? { k: "Capital", v: c.country.capital, s: c.country.region ?? "", icon: "landmark" as const } : null,
    pop ? { k: "Population", v: compact.format(pop), s: p?.population_year ? `${p.population_year} estimate` : "", icon: "users" as const } : null,
    c.country.area_km2 ? { k: "Area", v: `${compact.format(c.country.area_km2)} km²`, s: "Land and water", icon: "ruler" as const } : null,
    c.country.official_languages?.length ? { k: "Language", v: c.country.official_languages.slice(0, 2).join(", "), s: "Official", icon: "languages" as const } : null,
    cur === "EUR" ? { k: "Money", v: "Euro (€)", s: "No exchange needed from the eurozone", icon: "coins" as const }
      : rate && cur ? { k: "Money", v: `1 € = ${rate.toLocaleString("en-GB", { maximumFractionDigits: rate < 10 ? 3 : 2 })} ${cur}`, s: c.money?.current?.is_daily ? "ECB daily rate" : "Annual average rate", icon: "coins" as const } : null,
    priceRatio ? { k: "Price level", v: `${Math.round(priceRatio * 100)}% of US`, s: `World Bank, ${p?.price_level_year ?? ""}`, icon: "tag" as const, meter: Math.min(1, priceRatio / 1.5) } : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null);
  const tabs = [
    { key: "glance" as const, label: "At a glance" },
    ...(hasMoney ? [{ key: "money" as const, label: "Money" }] : []),
    ...(hols.length ? [{ key: "holidays" as const, label: "Holidays", count: hols.length }] : []),
    ...(tourism.length > 1 ? [{ key: "tourism" as const, label: "Tourism" }] : []),
    { key: "destinations" as const, label: "Destinations", count: dests.length },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : "glance";
  const change = hasMoney ? ((pts[pts.length - 1].v - pts[0].v) / pts[0].v) * 100 : 0;
  const fmtR = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: v < 10 ? 4 : 2 });

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
              {c.country.capital && <span className="dchip"><Icon name="landmark" size={14} />{c.country.capital}</span>}
              <span className="dchip"><Icon name="pin" size={14} />{dests.length} destinations</span>
            </div>
          </div>
        </motion.div>
        <motion.aside className="panel planner-wrap entry" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <div className="pl-head"><span className="eyebrow">Entry check</span><span className="muted small0">Short tourist stay</span></div>
          <Visa c={c} />
        </motion.aside>
      </section>

      <div className="tabbar-wrap"><Tabs id="country" tabs={tabs} active={active} onChange={setTab} /></div>

      <section className="tabpanel">
        <AnimatePresence mode="wait">
          <motion.div key={active} className="tabfill" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            {active === "glance" && (
              <div className="glance2">
                <div className="facts2">{facts.map((f, i) => (
                  <motion.div key={f.k} className="fact2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <span className="f-ic"><Icon name={f.icon} size={18} /></span>
                    <span className="f-wm" aria-hidden="true"><Icon name={f.icon} size={96} /></span>
                    <span className="k">{f.k}</span><span className="v">{f.v}</span><span className="s">{f.s}</span>
                    {f.meter != null && <span className="meter" aria-hidden="true"><motion.i initial={{ width: 0 }} animate={{ width: `${f.meter * 100}%` }} transition={{ delay: 0.3, duration: 0.8 }} /><em style={{ left: `${(1 / 1.5) * 100}%` }} /></span>}
                  </motion.div>))}</div>
                <div className="side2">
                  <motion.div className={`adv2 ${adv.tone}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="adv2-h"><span className="f-ic"><Icon name="shield" size={18} /></span><span><span className="k">Official travel advice</span><StatusBadge tone={adv.tone} label={adv.title} /></span></div>
                    <p className="adv-text">{adv.text}</p>
                    {c.advisory && <p className="source">{c.advisory.issuer}{c.advisory.effective_at ? `, since ${fmtDate(c.advisory.effective_at)}` : ""}. <a href={AA_URL} target="_blank" rel="noreferrer">Source</a></p>}
                  </motion.div>
                  <div className="minis">
                    {hols[0] && (
                      <motion.button className="mini" onClick={() => setTab("holidays")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <span className="k"><Icon name="party" size={14} />Next holiday</span>
                        <span className="mid"><b>{hols[0].holiday_name}</b>
                        <span className="s">{hols[0].d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {inDays(hols[0].d)}</span></span>
                        <span className="go">{hols.length} this year <Icon name="arrow" size={13} /></span>
                      </motion.button>
                    )}
                    {last && (
                      <motion.button className="mini" onClick={() => setTab("tourism")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <span className="k"><Icon name="plane" size={14} />Visitors {last.year}</span>
                        <span className="mid"><b>{compact.format(last.arrivals ?? 0)}</b><span className="s">international arrivals</span></span>
                        <Spark values={tRows.map((t) => t.arrivals ?? 0)} />
                        <span className="go">{recovery != null ? `${recovery}% of 2019` : "Trend"} <Icon name="arrow" size={13} /></span>
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {active === "money" && hasMoney && (
              <div className="split">
                <div className="panel fill"><RateChart series={c.money!.series_120d!} currency={cur} /></div>
                <Kpis items={[
                  { k: "Today", v: `${fmtR(pts[pts.length - 1].v)} ${cur}`, s: "for 1 €" },
                  { k: "120-day change", v: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`, s: change >= 0 ? "Your euros buy more" : "Your euros buy less", tone: change >= 0 ? "up" : "down" },
                  { k: "High", v: fmtR(Math.max(...pts.map((x) => x.v))), s: cur },
                  { k: "Low", v: fmtR(Math.min(...pts.map((x) => x.v))), s: cur },
                ]} />
              </div>
            )}
            {active === "holidays" && <Holidays c={c} />}
            {active === "tourism" && (
              <div className="split">
                <div className="panel fill"><YearChart rows={tourism} title="International visitors" mutedLabel="Pandemic year" /></div>
                <Kpis items={[
                  ...(last ? [{ k: `Visitors ${last.year}`, v: compact.format(last.arrivals ?? 0), s: "International arrivals" }] : []),
                  ...(recovery != null ? [{ k: "vs 2019", v: `${recovery}%`, s: recovery >= 100 ? "Above pre-pandemic" : "Still recovering", tone: recovery >= 100 ? "up" : "down" }] : []),
                  ...(peak ? [{ k: "Peak year", v: String(peak.year), s: `${compact.format(peak.arrivals ?? 0)} visitors` }] : []),
                  ...(last?.receipts_per_arrival_usd ? [{ k: "Spend per visitor", v: `$${nf.format(Math.round(last.receipts_per_arrival_usd))}`, s: `${last.year}, US dollars` }] : []),
                ]} />
              </div>
            )}
            {active === "destinations" && (
              <div className="tile-grid">{dests.map((d, i) => <DestTile key={d.key} d={d} i={i} />)}</div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
