/**
 * Model-first thinking copy and honest engine labels (Keng, 29 Oct 2026).
 * Do not edit the Thai strings.
 */

export const THINKING_HINTS = [
  { atMs: 0, text: "พี่เจนกำลังคิดนะ" },
  { atMs: 6_000, text: "พี่เจนกำลังเลือกคำตอบที่ตรงกับเรื่องนี้อยู่นะ" },
  { atMs: 12_000, text: "ขอเวลาอีกนิดนะ พี่เจนอยากตอบให้ตรงที่สุด" },
  { atMs: 17_000, text: "ใกล้เสร็จแล้วนะ" },
] as const;

export const MODEL_ANSWER_LABEL = "คำตอบที่ AI ในเครื่องเลือกจากคลังคำตอบ";
export const RULES_ANSWER_LABEL = "คำตอบจากคลังคำตอบ";
export const READINESS_LINE = "กำลังเตรียมพี่เจน…";

export function thinkingHintAt(elapsedMs: number): string {
  let text: string = THINKING_HINTS[0].text;
  for (const h of THINKING_HINTS) {
    if (elapsedMs >= h.atMs) text = h.text;
  }
  return text;
}

export function engineAnswerLabel(engine: string | undefined, modelPick: boolean): string | null {
  if (!modelPick) return null;
  if (engine === "model") return MODEL_ANSWER_LABEL;
  return RULES_ANSWER_LABEL;
}
