/**
 * DRAFT — fixed openers and follow-up questions for grounded Jane chat.
 * For Keng's Thai copy review. Not approved product copy.
 *
 * The model may only pick ids from these lists. Free-text openers are not
 * allowed. No facts, numbers, drug or method names, or advice.
 */

export const CHAT_VOICE_STATUS = "draft" as const;

/** DRAFT. Keng review required before these strings are treated as product copy. */
export const CHAT_OPENERS_TH: readonly string[] = [
  "เราอยู่ตรงนี้นะคะ",
  "เราเข้าใจค่ะ",
  "ขอบคุณที่ถามมานะคะ",
  "เรื่องนี้เราเข้าใจค่ะ",
];

/** DRAFT. Gentle follow-up questions. No facts, numbers, drug or method names, or advice. */
export const CHAT_FOLLOWUPS_TH: readonly string[] = [
  "เธออยากเล่าเพิ่มไหมคะ?",
  "ตอนนี้อยากถามเรื่องไหนต่อดีคะ?",
  "ยังมีอะไรที่อยากคุยต่อไหมคะ?",
  "เธออยากให้ช่วยตรงไหนก่อนคะ?",
];

/** DRAFT. Used only if an English model-chat turn ever runs. */
export const CHAT_OPENERS_EN: readonly string[] = [
  "I'm here.",
  "I hear you.",
  "Thank you for asking.",
];

/** DRAFT. Gentle follow-up questions. No facts, numbers, drug or method names, or advice. */
export const CHAT_FOLLOWUPS_EN: readonly string[] = [
  "Would you like to tell me more?",
  "What would you like to ask next?",
  "Shall I share the checked information?",
];

export function openersFor(lang: "th" | "en"): readonly string[] {
  return lang === "en" ? CHAT_OPENERS_EN : CHAT_OPENERS_TH;
}

export function followUpsFor(lang: "th" | "en"): readonly string[] {
  return lang === "en" ? CHAT_FOLLOWUPS_EN : CHAT_FOLLOWUPS_TH;
}

/**
 * Follow-ups that offer to send the card. After the TH list drop in the
 * เรา/เธอ copy, only English still has one (EN q2). Compared by content,
 * not by index, so a later re-index cannot silently retarget the swap.
 */
export const CARD_OFFER_FOLLOWUPS: ReadonlySet<string> = new Set([
  "Shall I share the checked information?",
]);
