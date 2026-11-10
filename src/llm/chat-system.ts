/**
 * DRAFT — system prompts for chat-first Jane. For Keng's review.
 *
 * Status: DRAFT. Not approved product copy. Do not film or ship as reviewed
 * until Keng signs off. Persona: warm Thai voice. Jane is เจน, calls herself
 * เรา and the user เธอ. Visible replies are free text from the local model
 * (guarded). Reviewed bank cards are a fallback, not quoted into the bubble.
 *
 * The reply language is chosen by rules (`detectChatLang`), not by the model.
 * Thai turns keep this Thai persona (language line: ตอบเป็นภาษาไทย). English
 * turns use CHAT_SYSTEM_EN (language line: Reply in English.).
 *
 * Grounded at: chat-first plan, 29 Oct 2026 (warm, non-judgemental, short, no
 * roleplay). Safety stays: not medical advice, no sexual roleplay, Thai only,
 * no new hotlines. Thinking off is the Qwen3 Jinja hard switch
 * (`chat_template_kwargs.enable_thinking = false`). The template implements
 * that as a prefilled empty think-block assistant prefix.
 * `/no_think` is only a soft switch and is not used on the wllama path.
 */

import type { ChatReplyOpts } from "./adapter";
import type { ChatLang } from "./chat-lang";
import { normaliseChatReply } from "./chatGuard";

export const CHAT_SYSTEM_STATUS = "draft" as const;

export const CHAT_TEMPERATURE = 0.3;
export const CHAT_TOP_P = 0.9;
/**
 * Cap output length. 128 tokens stays: on-device 0.6B already uses 11–41 s of
 * the 45 s budget at this cap, so raising it would timeout the slow tail.
 * Truncated dumps are trimmed to the last complete sentence in chatGuard.
 */
export const CHAT_MAX_TOKENS = 128;

/**
 * Per-turn extra flags. `strict` is the one retry after a guard fail.
 * `facts` is unused on the free-text path (cards are a fallback, not quoted).
 */
export interface ChatGrounding {
  facts: string | null;
  strict?: boolean;
}

/** Per-turn language line. Rules pick this; the model does not. */
export const CHAT_LANG_LINE_TH = "ตอบเป็นภาษาไทย";
/** DRAFT. Keng review required. */
export const CHAT_LANG_LINE_EN = "Reply in English.";

/** DRAFT. Keng review required before this string is treated as product copy. */
export const CHAT_SYSTEM =
  "คุณคือเจน เรียกตัวเองว่าเรา เรียกผู้ใช้ว่าเธอ อบอุ่น สั้น ไม่ตัดสิน " +
  `${CHAT_LANG_LINE_TH}เท่านั้น ` +
  "สองประโยค ถามได้หนึ่งข้อ " +
  "ห้ามให้ข้อมูลทางการแพทย์ของตัวเอง ห้ามเบอร์โทร สายด่วน ขนาดยา ราคา ลิงก์ " +
  "ห้ามสวมบทบาท ห้ามคุยเชิงชู้สาว ห้ามบรรยายฉากทางเพศ " +
  "อย่าทวนข้อมูลส่วนตัวที่เธอพิมพ์มา";

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

/** DRAFT. One retry after a guard fail: still free text, still no facts. */
export const CHAT_RETRY_TH =
  "รอบนี้ตอบเป็นข้อความสั้น ๆ สองประโยค ห้ามข้อเท็จจริง ตัวเลข สายด่วน ลิงก์";
export const CHAT_RETRY_EN =
  "This retry must be two short sentences. No facts, numbers, hotlines, or links.";

export function chatSystemFor(lang: ChatLang, opts?: ChatReplyOpts): string {
  const persona = lang === "en" ? CHAT_SYSTEM_EN : CHAT_SYSTEM;
  if (opts?.grounding?.strict) {
    return `${persona}\n${lang === "en" ? CHAT_RETRY_EN : CHAT_RETRY_TH}`;
  }
  return persona;
}

export function chatUser(text: string): string {
  return text;
}

/**
 * wllama 3.8.1 `createChatCompletion` forwards this to llama.cpp Jinja as
 * extra template kwargs. Qwen3's chat template honours `enable_thinking`:
 * false prefills an empty think block so the 128-token budget is the reply,
 * not English reasoning. `/no_think` in the user turn is a soft switch the
 * 0.6B ignored on device. A manual assistant prefix would fight
 * add_generation_prompt, so we do not add one in `messages`.
 */
export const WLLAMA_NO_THINK_KWARGS = { enable_thinking: false } as const;

export type WllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Messages + Jinja kwargs for one wllama chat turn. User text is unchanged. */
export function buildWllamaChatPrompt(
  system: string,
  history: { role: "user" | "assistant"; content: string }[],
  userText: string,
): { messages: WllamaChatMessage[]; chat_template_kwargs: { enable_thinking: false } } {
  return {
    messages: [
      { role: "system", content: system },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: chatUser(userText) },
    ],
    chat_template_kwargs: { enable_thinking: false },
  };
}

/** Strip think tags, role prefixes and markdown; trim a truncated last clause. */
export function cleanChat(raw: string, lang: ChatLang = "th"): string {
  return normaliseChatReply(raw, lang);
}
