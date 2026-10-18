import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ClimateMonth } from "../lib/types";
import { MONTHS, MONTHS_LONG } from "../lib/months";
import { useWidth } from "../lib/useWidth";
import { colPath, niceMax } from "../lib/chart";

// One compact chart, three measures behind a toggle (one y-scale at a time, never a dual axis).
export const SEASON: Record<string, { cls: string; label: string }> = { best: { cls: "c-best", label: "Best" }, good: { cls: "c-good", label: "Good" } };
export const season = (l: string | null) => SEASON[l ?? ""] ?? { cls: "c-neutral", label: "Less ideal" };
const r0 = (v: number | null | undefined) => (v == null ? "–" : Math.round(v).toString());
type Metric = "comfort" | "temp" | "rain";
const METRICS: { key: Metric; label: string }[] = [{ key: "comfort", label: "Comfort" }, { key: "temp", label: "Temperature" }, { key: "rain", label: "Rain" }];

export function ClimateChart({ months, month, onMonth }: { months: ClimateMonth[]; month: number; onMonth: (m: number) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [metric, setMetric] = useState<Metric>("comfort");
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ms = [...months].sort((a, b) => a.month_num - b.month_num);
  if (ms.length !== 12) return null;

  const L = 38, R = 6, TOP = 12, P = 168, XL = 22, H = TOP + P + XL;
  const bw = Math.max(0, W - L - R) / 12, barW = Math.min(24, bw * 0.58), x = (i: number) => L + bw * i + bw / 2;
  const lows = ms.map((m) => m.temp_min_c ?? m.temp_mean_c ?? 0), highs = ms.map((m) => m.temp_max_c ?? m.temp_mean_c ?? 0);
  const tLo = Math.floor((Math.min(...lows) - 1) / 5) * 5, tHi = Math.ceil((Math.max(...highs) + 1) / 5) * 5;
  const rMax = niceMax(Math.max(1, ...ms.map((m) => m.rain_mm_month ?? 0)));
  const [lo, hi] = metric === "comfort" ? [0, 100] : metric === "temp" ? [tLo, tHi] : [0, rMax];
  const y = (v: number) => TOP + P - ((v - lo) / Math.max(1, hi - lo)) * P;
  const ticks = metric === "temp" ? [tLo, Math.round((tLo + tHi) / 2), tHi] : [lo, (lo + hi) / 2, hi];
  const sel = month - 1, h = hover != null ? ms[hover] : null;
  const band = ms.map((m, i) => `${x(i)},${y(m.temp_max_c ?? m.temp_mean_c ?? 0)}`).join(" L") + " L" + [...ms].reverse().map((m, j) => `${x(11 - j)},${y(m.temp_min_c ?? m.temp_mean_c ?? 0)}`).join(" L");
  const mean = ms.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.temp_mean_c ?? 0)}`).join(" ");

  return (
    <div className="cc-wrap">
      <div className="cc-head">
        <div className="seg-ctl" role="tablist" aria-label="Measure">
          {METRICS.map((m) => (
            <button key={m.key} role="tab" aria-selected={metric === m.key} className={metric === m.key ? "on" : ""} onClick={() => setMetric(m.key)}>
              {metric === m.key && <motion.span layoutId="metric-pill" className="seg-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        <div className="cc-legend">
          {metric === "comfort" && <><span><i className="sw c-best" />Best</span><span><i className="sw c-good" />Good</span><span><i className="sw c-neutral" />Less ideal</span></>}
          {metric === "temp" && <span>Band: day high to night low · line: average (°C)</span>}
          {metric === "rain" && <span>Rain per month (mm)</span>}
        </div>
        <button className="linkbtn" onClick={() => setTable((t) => !t)}>{table ? "Chart" : "Table"}</button>
      </div>

      {table ? (
        <div className="ctable"><table>
          <thead><tr><th>Month</th><th>Season</th><th>Comfort</th><th>High °C</th><th>Low °C</th><th>Rain mm</th><th>Humidity %</th></tr></thead>
          <tbody>{ms.map((m) => <tr key={m.month_num} className={m.month_num === month ? "sel" : ""} onClick={() => onMonth(m.month_num)}>
            <td>{MONTHS_LONG[m.month_num - 1]}</td><td>{season(m.season_label).label}</td><td>{r0(m.comfort_score)}</td><td>{r0(m.temp_max_c)}</td><td>{r0(m.temp_min_c)}</td><td>{r0(m.rain_mm_month)}</td><td>{r0(m.humidity_pct)}</td></tr>)}</tbody>
        </table></div>
      ) : (
        <div className="cc" ref={ref} onMouseLeave={() => setHover(null)}>
          {W > 0 && (
            <svg width={W} height={H} role="img" aria-label={`${metric} by month`}>
              <rect className="sel-band" x={L + bw * sel} y={0} width={bw} height={TOP + P} rx={8} />
              {hover != null && hover !== sel && <rect className="hov" x={L + bw * hover} y={0} width={bw} height={TOP + P} rx={8} />}
              {ticks.map((t) => <g key={t}><line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 8} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text></g>)}
              <AnimatePresence mode="wait">
                <motion.g key={metric} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  {metric === "comfort" && ms.map((m, i) => <motion.path key={i} className={`col ${season(m.season_label).cls}`} d={colPath(x(i), barW, y(0), y(m.comfort_score ?? 0))}
                    initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.03, duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }} />)}
                  {metric === "rain" && ms.map((m, i) => <motion.path key={i} className="col c-rain" d={colPath(x(i), barW, y(0), y(m.rain_mm_month ?? 0))}
                    initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.03, duration: 0.45 }} />)}
                  {metric === "temp" && <>
                    <path className="band" d={`M${band} Z`} />
                    <motion.path className="tline" d={mean} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
                    <circle className="tdot" cx={x(sel)} cy={y(ms[sel].temp_mean_c ?? 0)} r={4.5} />
                  </>}
                </motion.g>
              </AnimatePresence>
              {ms.map((_, i) => <text key={i} className={`xl${i === sel ? " on" : ""}`} x={x(i)} y={H - 4} textAnchor="middle">{W < 520 ? MONTHS[i][0] : MONTHS[i]}</text>)}
              {ms.map((m, i) => <rect key={i} className="hit" x={L + bw * i} y={0} width={bw} height={H} tabIndex={0}
                aria-label={`Select ${MONTHS_LONG[i]}: comfort ${r0(m.comfort_score)}, high ${r0(m.temp_max_c)} °C, rain ${r0(m.rain_mm_month)} mm`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => onMonth(i + 1)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onMonth(i + 1); } }} />)}
            </svg>
          )}
          {h && hover != null && hover !== sel && (
            <div className="cc-tip" style={{ left: Math.min(Math.max(x(hover), 100), W - 100), width: 190 }}>
              <div className="cc-tip-h"><strong>{MONTHS_LONG[hover]}</strong><span className={`pill ${season(h.season_label).cls}`}>{season(h.season_label).label}</span></div>
              <dl><dt>Comfort</dt><dd>{r0(h.comfort_score)}</dd><dt>Day / night</dt><dd>{r0(h.temp_max_c)}° / {r0(h.temp_min_c)}°</dd><dt>Rain</dt><dd>{r0(h.rain_mm_month)} mm</dd></dl>
              <p className="tip-hint">Click to plan this month</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
