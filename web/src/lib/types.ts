export interface Photo { id: string; src: string; credit?: string | null; license?: string | null; page?: string | null; }
export type MonthRef = number | string;
export interface IndexCountry {
  key: string; name: string; region?: string; capital?: string; lat?: number; lon?: number;
  advisory_level?: number | null; advisory_label?: string | null; currency?: string; rate_per_eur?: number | null;
  destinations?: number; cover?: Photo | null;
}
export interface IndexDestination {
  key: string; name: string; country_key: string; kind?: string; lat?: number; lon?: number;
  hero?: Photo | null; best_months?: MonthRef[]; peak_comfort?: number | null;
  top_highlights?: (string | { title?: string })[]; highlights?: number;
}
export interface SearchEntry { type: string; label: string; key: string; country_key?: string; }
export interface IndexFile { generated_at: string; run_id: string; countries: IndexCountry[]; destinations: IndexDestination[]; search: SearchEntry[]; }
export interface TrustFile {
  generated_at: string; counts: Record<string, number>;
  freshness: { source_id: string; last_run: string | null; last_rows?: number | null }[];
  entity_resolution_eval: Record<string, unknown>[]; sources: Record<string, unknown>[];
}
