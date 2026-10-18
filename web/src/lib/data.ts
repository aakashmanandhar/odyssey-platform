import { useEffect, useState } from "react";
import type { Photo } from "./types";

// All data comes from the static snapshot: /odyssey/data/<file>.json, photos from /odyssey/img/
const BASE = import.meta.env.BASE_URL; // "/odyssey/"
const pending = new Map<string, Promise<unknown>>();
const ready = new Map<string, unknown>();

export function load<T>(file: string): Promise<T> {
  if (!pending.has(file)) {
    const p = fetch(`${BASE}data/${file}`)
      .then((r) => { if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`); return r.json(); })
      .then((d) => { ready.set(file, d); return d; })
      .catch((e) => { pending.delete(file); throw e; });
    pending.set(file, p);
  }
  return pending.get(file) as Promise<T>;
}

export function useJSON<T>(file: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string }>(() =>
    file && ready.has(file) ? { data: ready.get(file) as T } : {});
  useEffect(() => {
    if (!file) return;
    if (ready.has(file)) { setState({ data: ready.get(file) as T }); return; }
    let alive = true;
    setState({});
    load<T>(file).then(
      (data) => alive && setState({ data }),
      (e: Error) => alive && setState({ error: e.message }));
    return () => { alive = false; };
  }, [file]);
  return state;
}

// Photos are cached on the server as WebP at two widths (serving/sync_snapshot.py): <id>-800.webp and <id>-1600.webp
export const localImg = (p: Photo, size: 800 | 1600) => `${BASE}img/${p.id}-${size}.webp`;
