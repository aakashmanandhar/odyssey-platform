import { Icon } from "./Icon";
export type Tone = "ok" | "warn" | "bad" | "neutral";
// Status is never colour alone: always an icon and a text label.
export function StatusBadge({ tone, label, onPhoto = false }: { tone: Tone; label: string; onPhoto?: boolean }) {
  const icon = tone === "ok" ? "check" : tone === "neutral" ? "info" : "alert";
  return <span className={`status ${tone}${onPhoto ? " on-photo" : ""}`}><Icon name={icon} size={14} />{label}</span>;
}
