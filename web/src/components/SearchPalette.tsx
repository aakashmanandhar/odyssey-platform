import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { IndexFile, SearchEntry } from "../lib/types";
import { kindLabel, norm } from "../lib/format";
import { Icon } from "./Icon";
import { Img } from "./Img";

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { data } = useJSON<IndexFile>("index.json");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const lookup = useMemo(() => data && {
    dest: new Map(data.destinations.map((d) => [d.key, d])),
    country: new Map(data.countries.map((c) => [c.key, c])),
  }, [data]);

  const results: SearchEntry[] = useMemo(() => {
    if (!data || !lookup) return [];
    const nq = norm(q.trim());
    if (!nq) {
      return [...data.destinations].sort((a, b) => (b.highlights ?? 0) - (a.highlights ?? 0)).slice(0, 8)
        .map((d) => ({ type: "destination", label: d.name, key: d.key, country_key: d.country_key }));
    }
    const scored: { s: SearchEntry; r: number }[] = [];
    for (const s of data.search) {
      if (s.type !== "destination" && s.type !== "country") continue;
      const l = norm(s.label);
      const r = l.startsWith(nq) ? 0 : l.split(/[\s\-–,()/]+/).some((w) => w.startsWith(nq)) ? 1 : l.includes(nq) ? 2 : -1;
      if (r < 0) continue;
      const pop = s.type === "country" ? 500 : (lookup.dest.get(s.key)?.highlights ?? 0);
      scored.push({ s, r: r * 1000 - pop });
    }
    const seen = new Set<string>();
    return scored.sort((a, b) => a.r - b.r).map((x) => x.s)
      .filter((s) => { const k = s.type + s.key; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 8);
  }, [data, lookup, q]);

  useEffect(() => setSel(0), [q]);

  const go = (s: SearchEntry) => { navigate(s.type === "country" ? `/c/${s.key}` : `/d/${s.key}`); onClose(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[sel]) go(results[sel]);
  };

  return (
    <motion.div className="sp-back" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="sp" role="dialog" aria-modal="true" aria-label="Search destinations and countries"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: -14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.18 }}>
        <div className="sp-in">
          <Icon name="search" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search a city, region or country" aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        <ul className="sp-list" role="listbox">
          {results.map((s, i) => {
            const d = lookup?.dest.get(s.key);
            const c = lookup?.country.get(s.type === "country" ? s.key : (s.country_key ?? d?.country_key ?? ""));
            const photo = s.type === "country" ? c?.cover : d?.hero;
            return (
              <li key={s.type + s.key} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""}
                onMouseEnter={() => setSel(i)} onClick={() => go(s)}>
                <div className="sp-thumb">{photo && <Img photo={photo} size={800} alt="" showCredit={false} />}</div>
                <div>
                  <div className="sp-label">{s.label}</div>
                  <div className="sp-sub">{s.type === "country" ? `Country · ${c?.region ?? ""}` : `${c?.name ?? s.country_key} · ${kindLabel(d?.kind)}`}</div>
                </div>
                <Icon name="arrow" size={16} />
              </li>
            );
          })}
        </ul>
        {q && data && results.length === 0 && <p className="sp-empty">No match for “{q}”. Try a city or country name.</p>}
        <div className="sp-foot">
          <span>{q ? "Results" : "Popular destinations"}</span>
          <span><kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
