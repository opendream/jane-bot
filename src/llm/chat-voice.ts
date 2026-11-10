/**
 * DRAFT — unused visible-line lists (kept as voice reference).
 * Live Jane replies are free text from the local model, not picked from here.
 * No facts, numbers, drug or method names, or advice.
 */

export const CHAT_VOICE_STATUS = "draft" as const;

/**
 * Model-facing TH ids stay the v40 numbering the fine-tune was trained on
 * (`{"o":N,"c":0|1,"q":N}`). Live เรา/เธอ strings sit at the same slots.
 * Dropped v40 ids (o4 `ทางนี้พี่เข้าใจ`, q2 `อยากให้พี่ส่งข้อมูลที่ตรวจแล้วไหม?`)
 * keep their index so later ids do not shift, and resolve to the same empty
 * fallback `renderChatChoice` already uses for an out-of-range index (`?? ""`).
 */
export const INVALID_VOICE_INDEX_FALLBACK = "";
/** Inclusive max o the v40 Thai list accepted (0..4). */
export const V40_OPENER_MAX_TH = 4;
/** Inclusive max q the v40 Thai list accepted (0..4). */
export const V40_FOLLOWUP_MAX_TH = 4;

/** DRAFT. Keng review required before these strings are treated as product copy. */
export const CHAT_OPENERS_TH: readonly string[] = [
  "เราอยู่ตรงนี้นะคะ",
  "เราเข้าใจค่ะ",
  "ขอบคุณที่ถามมานะคะ",
  "เรื่องนี้เราเข้าใจค่ะ",
  INVALID_VOICE_INDEX_FALLBACK,
];

/** DRAFT. Gentle follow-up questions. No facts, numbers, drug or method names, or advice. */
export const CHAT_FOLLOWUPS_TH: readonly string[] = [
  "เธออยากเล่าเพิ่มไหมคะ?",
  "ตอนนี้อยากถามเรื่องไหนต่อดีคะ?",
  INVALID_VOICE_INDEX_FALLBACK,
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
