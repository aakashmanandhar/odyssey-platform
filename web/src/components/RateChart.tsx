import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fitPlot, useSize } from "../lib/useSize";

// Field names in the rate series are detected, not assumed (date-like key, numeric rate key).
export function ratePoints(series: Record<string, unknown>[]) {
  if (!series.length) return [];
  const keys = Object.keys(series[0]);
  const dk = keys.find((k) => /date|day/i.test(k)), vk = keys.find((k) => /rate/i.test(k) && typeof series[0][k] === "number");
  if (!dk || !vk) return [];
  return series.map((r) => ({ d: String(r[dk]), v: Number(r[vk]) })).filter((p) => isFinite(p.v)).sort((a, b) => a.d.localeCompare(b.d));
}

// 120-day exchange-rate line (2px line, 10% area wash, crosshair + readout).
export function RateChart({ series, currency }: { series: Record<string, unknown>[]; currency: string }) {
  const [ref, W, CH] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(() => ratePoints(series), [series]);
  if (pts.length < 5) return null;
  const L = 52, R = 10, TOP = 10, XL = 22, P = fitPlot(CH, TOP + XL, 150), H = TOP + P + XL;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)), pad = (hi - lo) * 0.15 || hi * 0.01;
  const y0 = lo - pad, y1 = hi + pad;
  const x = (i: number) => L + (i / (pts.length - 1)) * Math.max(0, W - L - R);
  const y = (v: number) => TOP + P - ((v - y0) / (y1 - y0)) * P;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(" ");
  const area = `${line} L${x(pts.length - 1)},${TOP + P} L${x(0)},${TOP + P} Z`;
  const fmt = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: v < 10 ? 4 : 2 });
  const day = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    setHover(Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1)));
  };
  const h = hover != null ? pts[Math.min(Math.max(hover, 0), pts.length - 1)] : null, hi_ = hover != null ? Math.min(Math.max(hover, 0), pts.length - 1) : 0;
  const change = ((pts[pts.length - 1].v - pts[0].v) / pts[0].v) * 100;
  return (
    <div className="cc-wrap">
      <p className="muted small">1 € in {currency}, last {pts.length} published days: <strong>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</strong> ({change >= 0 ? "your euros buy more" : "your euros buy less"} than at the start).</p>
      <div className="cc" ref={ref} onMouseLeave={() => setHover(null)}>
        {W > 0 && (
          <svg width={W} height={H} role="img" aria-label={`Exchange rate, 1 euro in ${currency}`}>
            {[y0 + pad, (y0 + y1) / 2, y1 - pad].map((t) => <g key={t}><line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 8} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
            <motion.path className="rarea" d={area} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} />
            <motion.path className="rline" d={line} initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2 }} />
            {[0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i) => <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}>{day(pts[i].d)}</text>)}
            {h && <><line className="xhair" x1={x(hi_)} x2={x(hi_)} y1={TOP} y2={TOP + P} /><circle className="rdot" cx={x(hi_)} cy={y(h.v)} r={4.5} /></>}
            <rect className="hit" x={L} y={0} width={Math.max(0, W - L - R)} height={TOP + P} onMouseMove={onMove} />
          </svg>
        )}
        {h && <div className="cc-tip" style={{ left: Math.min(Math.max(x(hi_), 112), W - 112) }}><div className="cc-tip-h"><strong>{day(h.d)}</strong></div><dl><dt>1 €</dt><dd>{fmt(h.v)} {currency}</dd></dl></div>}
      </div>
    </div>
  );
}
