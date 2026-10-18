import { motion } from "framer-motion";
// Animated 270-degree ring for a 0-100 comfort score; the arc colour follows the season class.
export function ComfortGauge({ value, cls, label }: { value: number | null; cls: string; label: string }) {
  const r = 46, c = 2 * Math.PI * r, arc = c * 0.75, v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="gauge" role="img" aria-label={`Comfort ${value ?? "unknown"} out of 100, ${label}`}>
      <svg viewBox="0 0 120 120" width="132" height="132">
        <circle className="g-track" cx="60" cy="60" r={r} strokeDasharray={`${arc} ${c}`} transform="rotate(135 60 60)" />
        <motion.circle className={`g-val ${cls}`} cx="60" cy="60" r={r} transform="rotate(135 60 60)"
          strokeDasharray={`${arc} ${c}`} initial={false} animate={{ strokeDashoffset: arc * (1 - v / 100) }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
      </svg>
      <div className="g-center"><motion.b key={v} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{value ?? "–"}</motion.b><span>comfort</span></div>
    </div>
  );
}
