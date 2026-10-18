import { useEffect, useRef, useState } from "react";
// Width and height of an element, kept up to date, so charts can fill whatever space their panel has.
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size.w, size.h] as const;
}
// Plot height that fills the box but stays readable: `fallback` until the box is measured.
export const fitPlot = (boxH: number, chrome: number, fallback: number, max = 420) => (boxH > 0 ? Math.max(110, Math.min(max, boxH - chrome)) : fallback);
