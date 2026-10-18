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
    <div className="page-fit">
      <div className="pg-head">
        <div><p className="eyebrow">Countries</p><h1>{list.length} countries, briefed</h1></div>
        <p className="muted">Safety advice, money, visas, holidays and tourism trends, updated automatically.</p>
      </div>
      <div className="ctry-bento">
        {list.map((c, i) => {
          const b = badge(c.advisory_level, c.advisory_label);
          return (
            <motion.div key={c.key} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.035, duration: 0.4 }}>
              <Link to={`/c/${c.key}`} className="cbento">
                {c.cover && <Img photo={c.cover} size={800} alt="" showCredit={false} />}
                <div className="cbento-in">
                  <span className="reg">{c.region}</span>
                  <b>{c.name}</b>
                  <div className="cb-row"><StatusBadge tone={b.tone} label={b.text} onPhoto /></div>
                  <span className="meta">{c.destinations ?? 0} destinations · {c.currency === "EUR" ? "Euro" : `1 € = ${(c.rate_per_eur ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${c.currency}`}</span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
