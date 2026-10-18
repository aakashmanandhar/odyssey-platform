import { useState } from "react";
import { motion } from "framer-motion";
import type { ClimateMonth } from "../lib/types";
import { MONTHS, MONTHS_LONG } from "../lib/months";
import { useWidth } from "../lib/useWidth";

// Three small multiples sharing one month axis (one y-scale each, never a dual axis):
// comfort score (columns coloured by season), temperature (min-max band + mean line), rainfall (columns).
const SEASON: Record<string, { cls: string; label: string }> = {
  best: { cls: "c-best", label: "Best" },
  good: { cls: "c-good", label: "Good" },
};
const season = (l: string | null) => SEASON[l ?? ""] ?? { cls: "c-neutral", label: "Less ideal" };
const niceMax = (v: number) => [10, 20, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000].find((s) => s >= v) ?? Math.ceil(v / 500) * 500;
const r0 = (v: number | null | undefined) => (v == null ? "–" : Math.round(v).toString());

// Column with a 4px rounded data-end, square at the baseline.
function col(xc: number, w: number, base: number, top: number) {
  if (base - top < 0.5) return "";
  const x = xc - w / 2, r = Math.min(4, w / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

export function ClimateChart({ months }: { months: ClimateMonth[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ms = [...months].sort((a, b) => a.month_num - b.month_num);
  if (ms.length !== 12) return null;

  const L = 38, R = 6, TOP = 22, P1 = 104, P2 = 104, P3 = 76, GAP = 40, XL = 22;
  const H = TOP + P1 + GAP + P2 + GAP + P3 + XL;
  const iw = Math.max(0, W - L - R), bw = iw / 12, barW = Math.min(24, bw * 0.6);
  const x = (i: number) => L + bw * i + bw / 2;
  const narrow = W < 520;

  const yC = (v: number) => TOP + P1 - (v / 100) * P1;
  const lows = ms.map((m) => m.temp_min_c ?? m.temp_mean_c ?? 0), highs = ms.map((m) => m.temp_max_c ?? m.temp_mean_c ?? 0);
  const tLo = Math.floor((Math.min(...lows) - 1) / 5) * 5, tHi = Math.ceil((Math.max(...highs) + 1) / 5) * 5;
  const T0 = TOP + P1 + GAP;
  const yT = (v: number) => T0 + P2 - ((v - tLo) / Math.max(1, tHi - tLo)) * P2;
  const rMax = niceMax(Math.max(1, ...ms.map((m) => m.rain_mm_month ?? 0)));
  const R0 = T0 + P2 + GAP;
  const yR = (v: number) => R0 + P3 - (v / rMax) * P3;

  const band = ms.map((m, i) => `${x(i)},${yT(m.temp_max_c ?? m.temp_mean_c ?? 0)}`).join(" L") ;
  const bandBack = [...ms].reverse().map((m, j) => `${x(11 - j)},${yT(m.temp_min_c ?? m.temp_mean_c ?? 0)}`).join(" L");
  const meanLine = ms.map((m, i) => `${i ? "L" : "M"}${x(i)},${yT(m.temp_mean_c ?? 0)}`).join(" ");
  const h = hover != null ? ms[hover] : null;

  return (
    <div className="cc-wrap">
      <div className="cc-head">
        <div className="cc-legend" aria-label="Legend">
          <span><i className="sw c-best" />Best</span>
          <span><i className="sw c-good" />Good</span>
          <span><i className="sw c-neutral" />Less ideal</span>
        </div>
        <button className="linkbtn" onClick={() => setTable((t) => !t)}>{table ? "Show chart" : "Show as table"}</button>
      </div>

      {table ? (
        <div className="ctable">
          <table>
            <thead><tr><th>Month</th><th>Season</th><th>Comfort</th><th>High °C</th><th>Low °C</th><th>Rain mm</th><th>Humidity %</th><th>Cloud %</th></tr></thead>
            <tbody>{ms.map((m) => (
              <tr key={m.month_num}><td>{MONTHS_LONG[m.month_num - 1]}</td><td>{season(m.season_label).label}</td><td>{r0(m.comfort_score)}</td>
                <td>{r0(m.temp_max_c)}</td><td>{r0(m.temp_min_c)}</td><td>{r0(m.rain_mm_month)}</td><td>{r0(m.humidity_pct)}</td><td>{r0(m.cloud_pct)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="cc" ref={ref} onMouseLeave={() => setHover(null)}>
          {W > 0 && (
            <svg width={W} height={H} role="img" aria-label="Monthly comfort score, temperature and rainfall">
              {hover != null && <rect className="hov" x={L + bw * hover} y={TOP - 14} width={bw} height={H - TOP - XL + 14} rx={8} />}

              <text className="ptitle" x={0} y={12}>Comfort score (0–100)</text>
              {[0, 50, 100].map((t) => <g key={t}><line className="grid" x1={L} x2={W - R} y1={yC(t)} y2={yC(t)} /><text x={L - 8} y={yC(t) + 4} textAnchor="end">{t}</text></g>)}
              {ms.map((m, i) => (
                <motion.path key={m.month_num} className={`col ${season(m.season_label).cls}`} d={col(x(i), barW, yC(0), yC(m.comfort_score ?? 0))}
                  initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }} />
              ))}

              <text className="ptitle" x={0} y={T0 - 10}>Temperature (°C): daily high to low, line = average</text>
              {[tLo, Math.round((tLo + tHi) / 2), tHi].map((t) => <g key={t}><line className="grid" x1={L} x2={W - R} y1={yT(t)} y2={yT(t)} /><text x={L - 8} y={yT(t) + 4} textAnchor="end">{t}</text></g>)}
              <motion.path className="band" d={`M${band} L${bandBack} Z`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }} />
              <motion.path className="tline" d={meanLine} initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: "easeInOut" }} />
              {hover != null && h && <circle className="tdot" cx={x(hover)} cy={yT(h.temp_mean_c ?? 0)} r={4.5} />}

              <text className="ptitle" x={0} y={R0 - 10}>Rainfall (mm per month)</text>
              {[0, rMax].map((t) => <g key={t}><line className="grid" x1={L} x2={W - R} y1={yR(t)} y2={yR(t)} /><text x={L - 8} y={yR(t) + 4} textAnchor="end">{t}</text></g>)}
              {ms.map((m, i) => (
                <motion.path key={m.month_num} className="col c-rain" d={col(x(i), barW, yR(0), yR(m.rain_mm_month ?? 0))}
                  initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.04, duration: 0.5 }} />
              ))}

              {ms.map((m, i) => <text key={m.month_num} className={`xl${hover === i ? " on" : ""}`} x={x(i)} y={H - 4} textAnchor="middle">{narrow ? MONTHS[i][0] : MONTHS[i]}</text>)}
              {ms.map((m, i) => (
                <rect key={m.month_num} className="hit" x={L + bw * i} y={0} width={bw} height={H} tabIndex={0}
                  aria-label={`${MONTHS_LONG[i]}: comfort ${r0(m.comfort_score)}, high ${r0(m.temp_max_c)} °C, low ${r0(m.temp_min_c)} °C, rain ${r0(m.rain_mm_month)} mm`}
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} />
              ))}
            </svg>
          )}
          {h && hover != null && (
            <div className="cc-tip" style={{ left: Math.min(Math.max(x(hover), 112), W - 112) }}>
              <div className="cc-tip-h"><strong>{MONTHS_LONG[hover]}</strong><span className={`pill ${season(h.season_label).cls}`}>{season(h.season_label).label}</span></div>
              <dl>
                <dt>Comfort</dt><dd>{r0(h.comfort_score)} / 100</dd>
                <dt>Day / night</dt><dd>{r0(h.temp_max_c)}° / {r0(h.temp_min_c)}°C</dd>
                <dt>Rain</dt><dd>{r0(h.rain_mm_month)} mm</dd>
                <dt>Humidity</dt><dd>{r0(h.humidity_pct)}%</dd>
                <dt>Cloud cover</dt><dd>{r0(h.cloud_pct)}%</dd>
                {h.wind_m_s != null && <><dt>Wind</dt><dd>{Math.round(h.wind_m_s * 3.6)} km/h</dd></>}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
