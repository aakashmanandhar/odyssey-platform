import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
// Horizontal snap carousel: swipe or trackpad on touch and desktop, arrow buttons that hide at the ends.
export function Carousel({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (el) setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  };
  useEffect(() => { update(); const el = ref.current; if (!el) return; const ro = new ResizeObserver(update); ro.observe(el); return () => ro.disconnect(); }, [children]);
  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div className="car" role="region" aria-label={label}>
      <div className="car-track" ref={ref} onScroll={update}>{children}</div>
      {!edge.start && <button className="car-btn prev" onClick={() => go(-1)} aria-label="Previous"><span style={{ transform: "rotate(180deg)", display: "grid" }}><Icon name="arrow" size={18} /></span></button>}
      {!edge.end && <button className="car-btn next" onClick={() => go(1)} aria-label="Next"><Icon name="arrow" size={18} /></button>}
    </div>
  );
}
