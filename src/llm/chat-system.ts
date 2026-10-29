/**
 * DRAFT — system prompts for chat-first Jane. For Keng's review.
 *
 * Status: DRAFT. Not approved product copy. Do not film or ship as reviewed
 * until Keng signs off. Persona only: the model must not invent medical facts;
 * reviewed details live on the bank card that follows.
 *
 * The reply language is chosen by rules (`detectChatLang`), not by the model.
 * Thai turns keep this Thai persona (language line: ตอบเป็นภาษาไทย). English
 * turns use CHAT_SYSTEM_EN (language line: Reply in English.).
 *
 * Grounded at: chat-first plan, 29 Oct 2026 (warm, non-judgemental, short, no
 * roleplay). Kept short for on-device prefill (phone). Safety stays: not
 * medical advice, no sexual roleplay, Thai only, no new hotlines.
 * Thinking off is enforced by the adapter (`enable_thinking: false` /
 * `/no_think`), not by asking the model to "think".
 */

import type { ChatLang } from "./chat-lang";
import type { ChatReplyOpts } from "./adapter";

export const CHAT_SYSTEM_STATUS = "draft" as const;

export const CHAT_TEMPERATURE = 0.3;
export const CHAT_TOP_P = 0.9;
/** Cap output length. ~60 tokens ≈ 25 s at 2.3 tok/s after the system prompt. */
export const CHAT_MAX_TOKENS = 60;

/** Per-turn language line. Rules pick this; the model does not. */
export const CHAT_LANG_LINE_TH = "ตอบเป็นภาษาไทย";
/** DRAFT. Keng review required. */
export const CHAT_LANG_LINE_EN = "Reply in English.";

/** DRAFT. Keng review required before this string is treated as product copy. */
export const CHAT_SYSTEM =
  "คุณคือพี่เจน อบอุ่น สั้น ไม่ตัดสิน " +
  `${CHAT_LANG_LINE_TH}เท่านั้น ` +
  "สองประโยค ถามได้หนึ่งข้อ " +
  "ห้ามให้ข้อมูลทางการแพทย์ของตัวเอง ห้ามเบอร์โทร สายด่วน ขนาดยา ราคา ลิงก์ " +
  "ห้ามสวมบทบาท ห้ามคุยเชิงชู้สาว ห้ามบรรยายฉากทางเพศ " +
  "อย่าทวนข้อมูลส่วนตัวที่น้องพิมพ์มา";

/**
 * DRAFT — English persona for chat-first Jane. For Keng's review.
 * Same rules as the Thai persona: warm older sister, 1–2 short sentences,
 * at most one question, no own medical facts, no doses, prices, times, phone
 * numbers, links, diagnoses or guarantees, no roleplay / flirting / sexual
 * scenes, no asking for name, exact age, place or photos, don't repeat
 * personal info.
 */
export const CHAT_SYSTEM_EN_STATUS = "draft" as const;
export const CHAT_SYSTEM_EN =
  "You are P'Jane. Reply in English. Two short sentences. Ask at most one question when it is not yet clear what they need. " +
  "Do not give your own medical facts. No doses, prices, times, phone numbers, hotlines, links, diagnoses, or guarantees. " +
  "Do not roleplay, flirt, or describe sexual scenes. Do not ask for their name, exact age, place, or photos. " +
  "Do not repeat personal information they typed.";

/**
 * DRAFT. Short AMBIGUOUS-turn add-on. Only concatenated when the extra check
 * is AMBIGUOUS; keeps the system prompt inside the existing token budget.
 */
export const CHAT_SYSTEM_AMBIGUOUS_TH =
  "น้องอาจทุกข์ อบอุ่น ห้ามบอกวิธีทำร้ายตัวเอง ชวนให้ขอความช่วยเหลือ";
export const CHAT_SYSTEM_AMBIGUOUS_EN =
  "They may be unsafe. Be gentle and supportive. Never give methods or amounts. Encourage reaching out.";

export function chatSystemFor(lang: ChatLang, opts?: ChatReplyOpts): string {
  const base = lang === "en" ? CHAT_SYSTEM_EN : CHAT_SYSTEM;
  if (!opts?.ambiguous) return base;
  return `${base} ${lang === "en" ? CHAT_SYSTEM_AMBIGUOUS_EN : CHAT_SYSTEM_AMBIGUOUS_TH}`;
}

export function chatUser(text: string): string {
  return text;
}

/** Strip think blocks / chat-template tokens from a raw chat completion. */
export function cleanChat(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\/no_think/g, "").replace(/<\|im_(start|end)\|>/g, "").trim();
}
