// Shared chart helpers (marks spec: 4px rounded data-end, square at the baseline).
export function colPath(xc: number, w: number, base: number, top: number) {
  if (base - top < 0.5) return "";
  const x = xc - w / 2, r = Math.min(4, w / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}
export function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((s) => s >= v)) ?? 10 * p;
}
export const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
