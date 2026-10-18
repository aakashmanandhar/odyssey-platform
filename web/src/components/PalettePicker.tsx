import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Palette } from "lucide-react";

// Live palette switcher: sets data-palette on <html>; remembered per device.
export const PALETTES = [
  { key: "alpine", name: "Alpine Mist (default)", sw: ["#0E1513", "#6FBFA6", "#8FB3E0", "#F5A98B"] },
  { key: "aurora", name: "Midnight Aurora", sw: ["#0B0E1A", "#7C5CFF", "#22D3EE", "#F472B6"] },
  { key: "ocean", name: "Ocean Sunset", sw: ["#071A1F", "#2EC4B6", "#FF7A59", "#F7C35F"] },
  { key: "desert", name: "Desert Dusk", sw: ["#17110E", "#E8935A", "#D9675B", "#9DB57A"] },
  { key: "nordic", name: "Nordic Ice", sw: ["#0A1118", "#4DA3FF", "#7EE0D2", "#C3D0E0"] },
];

export function PalettePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() => document.documentElement.dataset.palette ?? "aurora");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const pick = (k: string) => {
    if (k === "aurora") delete document.documentElement.dataset.palette; else document.documentElement.dataset.palette = k;
    try { localStorage.setItem("odyssey-palette", k); } catch { /* not remembered */ }
    setCurrent(k);
  };
  return (
    <div className="pal-wrap" ref={ref}>
      <button className="side-link" onClick={() => setOpen((o) => !o)} aria-label="Colour palette" aria-expanded={open}>
        <Palette size={20} strokeWidth={1.8} aria-hidden="true" /><span className="side-tip">Colour palette</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="pal-pop" role="menu" initial={{ opacity: 0, x: -6, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -6, scale: 0.97 }} transition={{ duration: 0.15 }}>
            <p>Palette</p>
            {PALETTES.map((p) => (
              <button key={p.key} role="menuitemradio" aria-checked={current === p.key} className={`pal-opt${current === p.key ? " on" : ""}`} onClick={() => pick(p.key)}>
                <span className="pal-sw" style={{ ["--sw-bg" as string]: p.sw[0] }}>{p.sw.slice(1).map((c) => <i key={c} style={{ background: c }} />)}</span>{p.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
