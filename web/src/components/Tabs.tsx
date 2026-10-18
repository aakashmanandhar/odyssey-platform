import { motion } from "framer-motion";
// Tab bar with an animated indicator. Tabs are buttons with proper ARIA roles for keyboard and screen readers.
export function Tabs<T extends string>({ tabs, active, onChange, id }: { tabs: { key: T; label: string; count?: number }[]; active: T; onChange: (k: T) => void; id: string }) {
  return (
    <div className="ptabs" role="tablist" aria-label="Sections">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={active === t.key} className={active === t.key ? "on" : ""} onClick={() => onChange(t.key)}>
          {active === t.key && <motion.span layoutId={`tab-${id}`} className="ptab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span className="ptab-l">{t.label}{t.count != null && <em>{t.count}</em>}</span>
        </button>
      ))}
    </div>
  );
}
