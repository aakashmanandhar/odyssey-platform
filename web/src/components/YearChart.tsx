import { useState } from "react";
import { motion } from "framer-motion";
import { fitPlot, useSize } from "../lib/useSize";
import { colPath, compact, niceMax } from "../lib/chart";

export interface YearRow { year: number; value: number | null; muted?: boolean; detail: [string, string][] }

// Yearly column chart with hover readout; muted columns (e.g. pandemic years) are explained in the legend.
export function YearChart({ rows, title, mutedLabel }: { rows: YearRow[]; title: string; mutedLabel?: string }) {
  const [ref, W, CH] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const data = rows.filter((r) => r.value != null).sort((a, b) => a.year - b.year);
  if (data.length < 2) return null;
  const L = 44, R = 6, TOP = 12, XL = 22, P = fitPlot(CH, TOP + XL, 170), H = TOP + P + XL;
  const bw = Math.max(0, W - L - R) / data.length, barW = Math.min(24, bw * 0.7);
  const x = (i: number) => L + bw * i + bw / 2;
  const max = niceMax(Math.max(...data.map((d) => d.value as number)));
  const y = (v: number) => TOP + P - (v / max) * P;
  const every = W < 520 ? 5 : 2;
  const h = hover != null ? data[hover] : null;
  const anyMuted = data.some((d) => d.muted);
  return (
    <div className="cc-wrap">
      {anyMuted && mutedLabel && (
        <div className="cc-legend" style={{ marginBottom: 10 }}>
          <span><i className="sw c-best" />{title}</span><span><i className="sw c-muted" />{mutedLabel}</span>
        </div>
      )}
      <div className="cc" ref={ref} onMouseLeave={() => setHover(null)}>
        {W > 0 && (
          <svg width={W} height={H} role="img" aria-label={title}>
            {hover != null && <rect className="hov" x={L + bw * hover} y={0} width={bw} height={TOP + P} rx={6} />}
            {[0, max / 2, max].map((t) => <g key={t}><line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 8} y={y(t) + 4} textAnchor="end">{compact.format(t)}</text></g>)}
            {data.map((d, i) => (
              <motion.path key={d.year} className={`col ${d.muted ? "c-muted" : "c-best"}`} d={colPath(x(i), barW, y(0), y(d.value as number))}
                initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.02, duration: 0.5 }} />
            ))}
            {data.map((d, i) => (i % every === 0 || i === data.length - 1) && <text key={d.year} className={`xl${hover === i ? " on" : ""}`} x={x(i)} y={H - 4} textAnchor="middle">{d.year}</text>)}
            {data.map((d, i) => <rect key={d.year} className="hit" x={L + bw * i} y={0} width={bw} height={H} tabIndex={0}
              aria-label={`${d.year}: ${d.detail.map(([k, v]) => `${k} ${v}`).join(", ")}`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} />)}
          </svg>
        )}
        {h && hover != null && (
          <div className="cc-tip" style={{ left: Math.min(Math.max(x(hover), 112), W - 112) }}>
            <div className="cc-tip-h"><strong>{h.year}</strong>{h.muted && mutedLabel && <span className="pill c-neutral">{mutedLabel}</span>}</div>
            <dl>{h.detail.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + "v"}>{v}</dd>])}</dl>
          </div>
        )}
      </div>
    </div>
  );
}
