import type { MonthRef } from "./types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthNum(v: MonthRef): number | null {
  if (typeof v === "number") return v >= 1 && v <= 12 ? v : null;
  const i = MONTHS.findIndex((m) => v.toLowerCase().startsWith(m.toLowerCase()));
  if (i >= 0) return i + 1;
  const n = Number(v);
  return n >= 1 && n <= 12 ? n : null;
}

export function monthSet(list?: MonthRef[] | null): Set<number> {
  const s = new Set<number>();
  (list ?? []).forEach((v) => { const n = monthNum(v); if (n) s.add(n); });
  return s;
}

// {1,2,3,4,10,11,12} -> "Oct–Apr" (runs may wrap around the year end)
export function monthRanges(set: Set<number>): string {
  if (set.size === 0) return "No clear best season";
  if (set.size === 12) return "All year";
  let start = 1;
  while (set.has(start)) start++;
  const runs: [number, number][] = [];
  let run: number[] = [];
  for (let k = 1; k <= 12; k++) {
    const m = ((start - 1 + k) % 12) + 1;
    if (set.has(m)) run.push(m);
    else if (run.length) { runs.push([run[0], run[run.length - 1]]); run = []; }
  }
  return runs.map(([a, b]) => (a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]}–${MONTHS[b - 1]}`)).join(", ");
}
