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
  "พี่อยู่ตรงนี้นะ",
  "พี่เข้าใจ",
  "ไม่ต้องกังวล",
  "ขอบคุณที่ถามมา",
  "เรื่องนี้พี่เข้าใจ",
  "ทางนี้พี่เข้าใจ",
];

/** DRAFT. Gentle follow-up questions. No facts, numbers, drug or method names, or advice. */
export const CHAT_FOLLOWUPS_TH: readonly string[] = [
  "น้องอยากเล่าเพิ่มไหม?",
  "ตอนนี้อยากถามเรื่องไหนต่อดี?",
  "อยากให้พี่ส่งข้อมูลที่ตรวจแล้วไหม?",
  "ยังมีอะไรที่อยากคุยต่อไหม?",
  "น้องอยากให้ช่วยตรงไหนก่อน?",
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
