/**
 * Model-first thinking copy and honest engine labels (Keng, 29 Oct 2026).
 * Do not edit the Thai strings.
 */

export const THINKING_HINTS = [
  { atMs: 0, text: "เจนกำลังคิดนะ" },
  { atMs: 6_000, text: "เจนกำลังเลือกคำตอบที่ตรงกับเรื่องนี้อยู่นะ" },
  { atMs: 12_000, text: "ขอเวลาอีกนิดนะ เจนอยากตอบให้ตรงที่สุด" },
  { atMs: 17_000, text: "ใกล้เสร็จแล้วนะ" },
] as const;

export const MODEL_ANSWER_LABEL = "คำตอบที่ AI ในเครื่องเลือกจากคลังคำตอบ";
export const RULES_ANSWER_LABEL = "คำตอบจากคลังคำตอบ";
export const READINESS_LINE = "กำลังเตรียมเจน…";

export function thinkingHintAt(elapsedMs: number): string {
  let text: string = THINKING_HINTS[0].text;
  for (const h of THINKING_HINTS) {
    if (elapsedMs >= h.atMs) text = h.text;
  }
  return text;
}

/** Ms until the next staged hint, or null after 17 s. Used so the UI is not polled. */
export function nextThinkingHintDelay(elapsedMs: number): number | null {
  for (const h of THINKING_HINTS) {
    if (elapsedMs < h.atMs) return h.atMs - elapsedMs;
  }
  return null;
}

export interface ThinkingHintRoot {
  querySelector(sel: string): { textContent: string | null } | null;
}

/** Patch the busy hint in place. Never recreates the textarea. */
export function applyThinkingHint(root: ThinkingHintRoot, text: string): boolean {
  const el = root.querySelector('[data-testid="chat-busy"]');
  if (!el) return false;
  if (el.textContent !== text) el.textContent = text;
  return true;
}

export function engineAnswerLabel(engine: string | undefined, modelPick: boolean): string | null {
  if (!modelPick) return null;
  if (engine === "model") return MODEL_ANSWER_LABEL;
  return RULES_ANSWER_LABEL;
}
