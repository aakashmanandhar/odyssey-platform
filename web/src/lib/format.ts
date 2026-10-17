export const nf = new Intl.NumberFormat("en-GB");
export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const KINDS: Record<string, string> = { city: "City", other_destination: "Region & nature" };
export function kindLabel(k?: string | null): string {
  if (!k) return "Destination";
  return KINDS[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
