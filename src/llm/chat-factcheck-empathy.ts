/**
 * DRAFT — whole empathy / greeting / hedging phrases for grounded Jane chat.
 * For Keng's Thai copy review. Not approved product copy.
 *
 * After whitespace collapse and stripping ending particles (ค่ะ/คะ/นะ/จ้ะ/ครับ/เลย),
 * a type-A sentence must equal one entry. Whole phrases only — not single words.
 * No facts, instructions, quantities, or numbers. Synthetic strings only.
 */

export const CHAT_EMPATHY_STATUS = "draft" as const;

/** DRAFT. Keng review required before these strings are treated as product copy. */
export const CHAT_EMPATHY_PHRASES_TH: readonly string[] = [
  "พี่เข้าใจ",
  "ทางนี้พี่เข้าใจ",
  "เรื่องนี้พี่เข้าใจ",
  "เรื่องแฟนนี่พี่เข้าใจ",
  "ไม่ต้องกังวล",
  "ขอบคุณที่ถามมา",
  "ขอโทษนะ พี่ยังตอบเรื่องนี้ไม่ได้",
  "พี่ยังตอบเรื่องนี้ไม่ได้",
  "ยังตอบเรื่องนี้ไม่ได้",
  "ยังไม่ทราบ",
  "กดขอข้อมูลเลย",
  "ขอข้อมูลเลย",
  "ขอกดขอข้อมูลเลย",
  "พี่อยู่ตรงนี้",
  "น้องเล่าเพิ่มได้เลย",
  "น้องซักถามได้เลย",
  "ซักถามได้เลย",
  "ขอโทษนะ",
  "ลองเล่ามา",
  "อยากฟัง",
  "พี่ฟังอยู่",
  "เล่ามาได้เลย",
  "เล่าเพิ่มได้เลย",
  "อยู่ตรงนี้",
];

/** DRAFT. Keng review required before these strings are treated as product copy. */
export const CHAT_EMPATHY_PHRASES_EN: readonly string[] = [
  "i'm here",
  "im here",
  "you can tell me more whenever you like",
  "you can tell me more",
  "i cannot answer that yet",
  "i can't answer that yet",
  "i do not know",
  "i don't know",
  "i don't know yet",
];
