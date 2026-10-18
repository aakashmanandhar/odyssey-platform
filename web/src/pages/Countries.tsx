import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { IndexFile } from "../lib/types";
import { Img } from "../components/Img";
import { StatusBadge, type Tone } from "../components/Status";
import { LoadError, Loading } from "../components/State";

// Badge from the advisory level and label (the detail page reads the full advisory flags).
function badge(lvl: number | null | undefined, label?: string | null): { tone: Tone; text: string } {
  const l = (label ?? "").toLowerCase();
  if (lvl == null) return { tone: "neutral", text: "No advisory" };
  if (lvl === 0) return { tone: "ok", text: "No travel warning" };
  if (/partial|teilreise/.test(l)) return { tone: "warn", text: "Partial warning" };
  if (/situation|safety|sicherheit/.test(l)) return { tone: "warn", text: "Safety notice" };
  return lvl >= 2 ? { tone: "bad", text: "Travel warning" } : { tone: "warn", text: "Safety notice" };
}

export default function Countries() {
  const { data, error } = useJSON<IndexFile>("index.json");
  if (error) return <LoadError message={error} />;
  if (!data) return <Loading label="Loading countries" />;
  const list = [...data.countries].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="wrap sec">
      <div className="sec-hd"><p className="eyebrow">Countries</p><h2>{list.length} countries, briefed</h2>
        <p className="muted">Safety advice, money, visas, holidays and tourism trends for each country, updated automatically.</p></div>
      <div className="grid ctry-grid">
        {list.map((c, i) => (
          <motion.article key={c.key} className="card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            {c.cover ? <Img photo={c.cover} size={800} alt={c.name} /> : <div className="ph failed"><div className="ph-fallback">{c.name[0]}</div></div>}
            <div className="card-body">
              <div className="sub">{c.region}</div>
              <h3>{c.name}</h3>
              {(() => { const b = badge(c.advisory_level, c.advisory_label); return <StatusBadge tone={b.tone} label={b.text} />; })()}
              <p className="best">{c.destinations ?? 0} destinations · {c.currency === "EUR" ? "Euro" : `1 € = ${(c.rate_per_eur ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${c.currency}`}</p>
            </div>
            <Link className="stretched" to={`/c/${c.key}`} aria-label={`Open ${c.name}`} />
          </motion.article>
        ))}
      </div>
    </section>
  );
}
