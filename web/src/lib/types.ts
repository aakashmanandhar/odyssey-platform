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
export interface ClimateMonth {
  month_num: number; month_name: string;
  temp_mean_c: number | null; temp_max_c: number | null; temp_min_c: number | null;
  rain_mm_month: number | null; humidity_pct: number | null; cloud_pct: number | null;
  sunshine_mj_m2_day: number | null; wind_m_s: number | null;
  comfort_score: number | null; season_label: string | null; is_top_month: boolean; temp_rain_source?: string;
}
export interface Highlight {
  highlight_rank: number; title: string; local_title?: string | null; category?: string | null; wiki_type?: string | null;
  highlight_score?: number; views_30d?: number | null; wikipedia_page_id?: number | null; wikidata_id?: string | null;
  lat?: number | null; lon?: number | null; photo?: Photo | null;
}
export interface DestinationFile {
  destination: { destination_key: string; country_key: string; name: string; kind?: string; wikivoyage_url?: string | null;
                 population?: number | null; population_date?: string | null; lat?: number; lon?: number };
  country: { key: string; name: string };
  hero?: Photo | null; banner?: Photo | null;
  highlights: Highlight[];
  climate: { months: ClimateMonth[]; best_months: MonthRef[]; top_months: MonthRef[]; peak_comfort: number | null } | null;
  places_by_category: Record<string, number> | null;
}
export interface CountryFile {
  country: { country_key: string; iso2?: string; iso3?: string; country_name: string; region?: string; capital?: string;
             population?: number | null; area_km2?: number | null; currency_codes?: string[]; official_languages?: string[]; lat?: number; lon?: number };
  profile: { population?: number | null; population_year?: number | null; destinations?: number; cities?: number;
             primary_currency?: string | null; rate_per_eur?: number | null; rate_basis?: string | null; rate_as_of?: string | null;
             price_level_ratio?: number | null; price_level_year?: number | null; arrivals_2019?: number | null } | null;
  advisory: { issuer?: string; advisory_level?: number | null; advisory_label?: string | null; warning?: boolean; partial_warning?: boolean;
              situation_warning?: boolean; situation_part_warning?: boolean; official_title?: string | null; effective_at?: string | null;
              source_last_modified_at?: string | null } | null;
  money: { currency?: string; current?: { rate_per_eur?: number | null; rate_as_of?: string | null; rate_basis?: string | null; is_daily?: boolean } | null;
           series_120d?: Record<string, unknown>[] } | null;
  holidays_next_12_months: { holiday_date: string; holiday_name: string }[] | null;
  tourism: { year: number; arrivals?: number | null; receipts_usd?: number | null; receipts_per_arrival_usd?: number | null; is_pandemic_year?: boolean }[] | null;
  visa: { as_of?: string | null; by_passport: Record<string, { category: string; days?: number | null }> } | null;
  destinations: (Omit<IndexDestination, "country_key"> & { country_key?: string })[];
}
