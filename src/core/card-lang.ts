import type { BankCard } from "./bank";
import type { ChatLang } from "../llm/chat-lang";

/**
 * English body/title fields a bank card may carry. None of these are generated:
 * they exist only when the bank JSON already has them.
 */
export type CardEnglishFields = {
  title_en?: string;
  answer_en?: string;
  variants_en?: string[];
};

/** DRAFT. Keng review required before this string is treated as product copy. */
export const CARD_THAI_NOTE_EN = "This info card is in Thai.";
export const CARD_THAI_NOTE_EN_STATUS = "draft" as const;

function isEnKey(k: string): boolean {
  return k === "en" || k.endsWith("_en");
}

function hasNonEmptyEn(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasNonEmptyEn);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isEnKey(k) && hasNonEmptyEn(v)) return true;
      if (hasNonEmptyEn(v)) return true;
    }
  }
  return false;
}

/** True when any English field or English variant on the card is non-empty. */
export function cardHasEnglish(card: BankCard | CardEnglishFields | Record<string, unknown>): boolean {
  if (!card || typeof card !== "object") return false;
  for (const [k, v] of Object.entries(card)) {
    if (isEnKey(k) && hasNonEmptyEn(v)) return true;
  }
  return false;
}

export function englishCardCoverage(cards: readonly (BankCard | Record<string, unknown>)[]): {
  withEnglish: number;
  total: number;
} {
  let withEnglish = 0;
  for (const c of cards) if (cardHasEnglish(c)) withEnglish++;
  return { withEnglish, total: cards.length };
}

function englishBody(card: BankCard | CardEnglishFields): string | null {
  const c = card as CardEnglishFields;
  if (typeof c.answer_en === "string" && c.answer_en.trim()) return c.answer_en;
  const variant = c.variants_en?.find((s) => typeof s === "string" && s.trim());
  return variant ?? null;
}

/**
 * Bank text only. English-turn users get answer_en / variants_en when the bank
 * has them; otherwise the Thai card is unchanged. Never translates.
 */
export function bankAnswerForLang(card: BankCard, lang: ChatLang): string {
  if (lang === "en") {
    const en = englishBody(card);
    if (en) return en;
  }
  return card.answer_th;
}

/**
 * DRAFT note shown above a Thai-only card on an English turn.
 * Locked / crisis / banner / refusals / talk-to-a-person skip this (callers pass null lang).
 */
export function cardNoteForLang(card: BankCard, lang: ChatLang | null): string | null {
  if (lang !== "en") return null;
  if (englishBody(card)) return null;
  return CARD_THAI_NOTE_EN;
}
