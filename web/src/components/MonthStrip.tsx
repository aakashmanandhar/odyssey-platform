import { motion } from "framer-motion";
import { MONTHS, monthRanges } from "../lib/months";

// 12 cells, one per month; best months filled, the selected month outlined.
export function MonthStrip({ best, current, labels = false }: { best: Set<number>; current?: number; labels?: boolean }) {
  return (
    <div role="img" aria-label={`Best months: ${monthRanges(best)}`}>
      <div className="ms">
        {MONTHS.map((m, i) => (
          <motion.i key={m}
            className={`${best.has(i + 1) ? "b" : ""} ${current === i + 1 ? "cur" : ""}`}
            initial={{ scaleY: 0.25, opacity: 0 }} whileInView={{ scaleY: 1, opacity: 1 }}
            viewport={{ once: true }} transition={{ delay: i * 0.025, duration: 0.35 }} />
        ))}
      </div>
      {labels && <div className="ms-labels">{MONTHS.map((m) => <span key={m}>{m[0]}</span>)}</div>}
    </div>
  );
}
