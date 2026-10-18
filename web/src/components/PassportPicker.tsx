import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { countryName, flag } from "../lib/countries";
import { norm } from "../lib/format";
import { Icon } from "./Icon";
import type { Tone } from "./Status";

// Searchable passport picker: type to filter, arrow keys to move, Enter to choose, Esc to close.
// Each option shows its entry result, so the list doubles as an at-a-glance map of who gets in easily.
// The menu is portalled to <body> so glass panels (backdrop-filter, overflow) never clip it.
export function PassportPicker({ codes, value, onChange, result }: {
  codes: string[]; value: string; onChange: (k: string) => void; result: (k: string) => { tone: Tone; short: string };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number }>({ left: 0, width: 0, maxH: 320 });
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), list = useRef<HTMLUListElement>(null);
  const items = useMemo(() => { const n = norm(q.trim()); return n ? codes.filter((k) => norm(countryName(k)).includes(n) || k.toLowerCase().startsWith(n)) : codes; }, [codes, q]);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect(), below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const width = Math.max(r.width, 300), left = Math.min(r.left, window.innerWidth - width - 12);
    setPos(below >= 300 || below >= above ? { left, width, top: r.bottom + 6, maxH: Math.min(380, below) } : { left, width, bottom: window.innerHeight - r.top + 6, maxH: Math.min(380, above) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, codes.indexOf(value))); setQ("");
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", away); window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("resize", close); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const pick = (k: string) => { onChange(k); setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && items[active]) { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); }
  };

  return (
    <>
      <button ref={btn} type="button" className={`pp-btn${open ? " open" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="pp-flag" aria-hidden="true">{flag(value) || "🛂"}</span>
        <span className="pp-txt"><small>Your passport</small><b>{countryName(value)}</b></span>
        <span className="pp-chev"><Icon name="chevron" size={18} /></span>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={menu} className="pp-menu" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
              initial={{ opacity: 0, y: pos.top != null ? -6 : 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.16 }}>
              <div className="pp-search"><Icon name="search" size={16} />
                <input autoFocus value={q} placeholder={`Search ${codes.length} passports`} aria-label="Search passports"
                  onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} role="combobox" aria-expanded="true" aria-controls="pp-list" />
                {q && <button type="button" className="pp-clear" onClick={() => setQ("")} aria-label="Clear search"><Icon name="x" size={14} /></button>}
              </div>
              <ul id="pp-list" ref={list} role="listbox" className="pp-list" style={{ maxHeight: pos.maxH - 58 }}>
                {items.map((k, i) => { const r = result(k); return (
                  <li key={k} data-i={i} role="option" aria-selected={k === value} className={`${i === active ? "act " : ""}${k === value ? "sel" : ""}`}
                    onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(k); }}>
                    <span className="pp-flag sm" aria-hidden="true">{flag(k)}</span>
                    <span className="pp-name">{countryName(k)}</span>
                    <span className={`pp-res ${r.tone}`}><i />{r.short}</span>
                    {k === value && <span className="pp-tick"><Icon name="check" size={14} /></span>}
                  </li>); })}
                {!items.length && <li className="pp-empty">No passport matches "{q}"</li>}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </>
  );
}
