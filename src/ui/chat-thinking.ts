/**
 * Chat-first thinking indicator copy and in-place phrase patch.
 *
 * DRAFT — pending Keng's review Sat 31 Oct. English set is for later and is
 * used only if an English turn ever runs the model.
 *
 * Never logs user text. Never added to the transcript.
 */

import type { ChatLang } from "../llm/chat-lang";

export const CHAT_THINKING_COPY_STATUS: "draft" | "reviewed" = "draft";

/** DRAFT. Keng review required before these strings are treated as product copy. */
export const CHAT_THINKING_PHRASES = {
  status: "draft" as const,
  th: [
    "พี่เจนกำลังคิดอยู่นะ",
    "พี่อ่านข้อความของเราอยู่นะ",
    "กำลังเรียบเรียงคำพูดอยู่",
    "แป๊บนึงนะ พี่อยู่ตรงนี้",
    "ค่อย ๆ คุยกันไปนะ",
    "พี่กำลังดูข้อมูลที่เกี่ยวข้องอยู่",
    "ไม่ต้องรีบนะ พิมพ์เพิ่มได้เลย",
    "ขอเวลาพี่อีกนิดนะ",
  ],
  en: [
    "Jane is thinking…",
    "I'm reading your messages…",
    "Putting my words together…",
    "One moment, I'm right here.",
    "We'll take this one step at a time.",
    "Looking at the related information…",
    "No rush, you can keep typing.",
    "Just a little more time…",
  ],
  label: {
    th: "พี่เจนกำลังคิด",
    en: "Jane is thinking",
  },
} as const;

/** Rotate about every 2–3 s. */
export const CHAT_THINKING_ROTATE_MS = 2500;

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function thinkingPhrasesFor(lang: ChatLang): readonly string[] {
  return CHAT_THINKING_PHRASES[lang];
}

export function thinkingLabelFor(lang: ChatLang): string {
  return CHAT_THINKING_PHRASES.label[lang];
}

export function thinkingPhraseAt(lang: ChatLang, index: number): string {
  const list = thinkingPhrasesFor(lang);
  return list[((index % list.length) + list.length) % list.length]!;
}

export interface ThinkingPhraseRoot {
  querySelector(sel: string): { textContent: string | null } | null;
}

/** Patch the visible phrase in place. Never recreates the textarea. Never writes the aria-live label. */
export function applyChatThinkingPhrase(root: ThinkingPhraseRoot, text: string): boolean {
  const el = root.querySelector('[data-testid="chat-thinking-phrase"]');
  if (!el) return false;
  if (el.textContent !== text) el.textContent = text;
  return true;
}
