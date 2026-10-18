import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

countries.registerLocale(en);
// ISO 3166 alpha-3 code -> English short name (e.g. "AUT" -> "Austria"); falls back to the code itself.
export const countryName = (iso3: string) => countries.getName(iso3, "en", { select: "official" }) ?? iso3;
// Best guess at the visitor's passport from the browser language region (e.g. de-DE -> DEU), default Germany.
export function guessPassport(available: string[]): string {
  try {
    const saved = localStorage.getItem("odyssey-passport");
    if (saved && available.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  const a3 = region ? countries.alpha2ToAlpha3(region) : undefined;
  return a3 && available.includes(a3) ? a3 : available.includes("DEU") ? "DEU" : available[0];
}
export function savePassport(iso3: string) {
  try { localStorage.setItem("odyssey-passport", iso3); } catch { /* storage unavailable */ }
}
