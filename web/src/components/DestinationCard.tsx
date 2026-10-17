import { Link } from "react-router-dom";
import type { IndexDestination } from "../lib/types";
import { monthRanges, monthSet } from "../lib/months";
import { kindLabel } from "../lib/format";
import { Img } from "./Img";
import { Icon } from "./Icon";
import { MonthStrip } from "./MonthStrip";

export function DestinationCard({ d, country, month }: { d: IndexDestination; country?: string; month?: number }) {
  const best = monthSet(d.best_months);
  const highlights = (d.top_highlights ?? [])
    .map((h) => (typeof h === "string" ? h : h?.title))
    .filter((t): t is string => Boolean(t))
    .slice(0, 3);
  return (
    <article className="card">
      {d.hero
        ? <Img photo={d.hero} size={800} alt={`${d.name}${country ? `, ${country}` : ""}`} />
        : <div className="ph failed"><div className="ph-fallback" aria-hidden="true">{d.name.slice(0, 1)}</div></div>}
      <div className="card-body">
        <div className="sub"><Icon name="pin" size={13} />{country ?? d.country_key} · {kindLabel(d.kind)}</div>
        <h3>{d.name}</h3>
        <MonthStrip best={best} current={month} />
        <p className="best">Best time: <b>{monthRanges(best)}</b></p>
        {highlights.length > 0 && <p className="hl">{highlights.join(" · ")}</p>}
      </div>
      <Link className="stretched" to={`/d/${d.key}`} aria-label={`Open ${d.name}`} />
    </article>
  );
}
