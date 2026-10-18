import { Link, useParams } from "react-router-dom";
import { useJSON } from "../lib/data";
import type { IndexFile } from "../lib/types";
import { Img } from "../components/Img";
import { OdysseyMark } from "../components/Logo";

// Temporary pages so every link works; each is replaced in step 5.4.
export function Soon({ title, note }: { title: string; note: string }) {
  return (
    <div className="page-fit soon-fit">
      <section className="panel soon-card">
        <span className="soon-ic"><OdysseyMark size={30} /></span>
        <p className="eyebrow">Coming next</p>
        <h1>{title}</h1>
        <p className="muted">{note}</p>
        <Link className="btn" to="/">Back to home</Link>
      </section>
    </div>
  );
}

export function DestinationSoon() {
  const { key } = useParams();
  const { data } = useJSON<IndexFile>("index.json");
  const d = data?.destinations.find((x) => x.key === key);
  const c = data?.countries.find((x) => x.key === d?.country_key);
  if (data && !d) return <Soon title="Destination not found" note="This link doesn't match any destination in the current snapshot." />;
  return (
    <section className="wrap soon">
      {d?.hero && <div className="soon-banner"><Img photo={d.hero} size={1600} alt={d.name} priority /></div>}
      <p className="eyebrow">{c?.name ?? ""}</p>
      <h1>{d?.name ?? "…"}</h1>
      <p className="muted">The full destination page (sights, climate, places) arrives in step 5.4.</p>
      <Link className="btn" to="/">Back to home</Link>
    </section>
  );
}

export function CountrySoon() {
  const { key } = useParams();
  const { data } = useJSON<IndexFile>("index.json");
  const c = data?.countries.find((x) => x.key === key);
  if (data && !c) return <Soon title="Country not found" note="This link doesn't match any country in the current snapshot." />;
  return (
    <section className="wrap soon">
      {c?.cover && <div className="soon-banner"><Img photo={c.cover} size={1600} alt={c.name} priority /></div>}
      <p className="eyebrow">{c?.region ?? ""}</p>
      <h1>{c?.name ?? "…"}</h1>
      <p className="muted">The full country briefing (advisory, money, visas, holidays, tourism) arrives in step 5.4.</p>
      <Link className="btn" to="/">Back to home</Link>
    </section>
  );
}
