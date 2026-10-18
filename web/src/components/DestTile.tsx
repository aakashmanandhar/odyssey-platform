import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { IndexDestination } from "../lib/types";
import { monthRanges, monthSet } from "../lib/months";
import { kindLabel } from "../lib/format";
import { Img } from "./Img";
import { MonthStrip } from "./MonthStrip";

// Photo tile for fill-the-panel grids: name, kind and best months over the photo.
export function DestTile({ d, i = 0, month }: { d: Pick<IndexDestination, "key" | "name" | "kind" | "hero" | "best_months" | "highlights">; i?: number; month?: number }) {
  const best = monthSet(d.best_months);
  return (
    <motion.div className="dtile-w" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.35 }}>
      <Link to={`/d/${d.key}`} className="dtile">
        {d.hero ? <Img photo={d.hero} size={800} alt="" showCredit={false} /> : <div className="ph failed"><div className="ph-fallback">{d.name.slice(0, 1)}</div></div>}
        <div className="dtile-in">
          <span className="sub">{kindLabel(d.kind)}{d.highlights ? ` · ${d.highlights} sights` : ""}</span>
          <b>{d.name}</b>
          <MonthStrip best={best} current={month} />
          <span className="best">Best {monthRanges(best)}</span>
        </div>
      </Link>
    </motion.div>
  );
}
