export type Intent =
  | "pregnancy"
  | "emergency_contraception"
  | "contraception"
  | "sti_hiv"
  | "relationship_consent"
  | "mental_health"
  | "violence"
  | "other";

export type Hours =
  | { type: "24h" }
  | { type: "varies" }
  | { type: "daily"; open: string; close: string };

export interface Source { url: string; title: string; checked: string; note?: string }
export interface Channel { type: string; label_th: string; value: string; href?: string }

export interface Service {
  id: string;
  name_th: string;
  name_en: string;
  description_th: string;
  channels: Channel[];
  hours: Hours;
  intents: Intent[];
  youth_friendly: boolean;
  verification: "verified" | "partial" | "unverified";
  verification_note?: string;
  sources: Source[];
}

export interface CrisisLine {
  id: string; number: string; href: string;
  name_th: string; name_en: string; when_th: string; hours_th: string;
  verification: string; verification_note?: string; sources: Source[];
}

export interface IntentResult {
  /** Ranked, most likely first. Never empty: falls back to ["other"]. */
  intents: Intent[];
  /** Keyword hits per intent, for transparency/debug (never logged). */
  scores: Partial<Record<Intent, number>>;
  source: "rules" | "model";
}

export type CrisisCategory = "self_harm" | "sexual_violence" | "violence_danger" | "medical_emergency";
export interface CrisisResult { crisis: boolean; categories: CrisisCategory[] }

export type AgeBand = "15-17" | "18-24" | "25+" | "unspecified";
