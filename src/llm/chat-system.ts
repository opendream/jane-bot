/**
 * DRAFT — system prompts for chat-first Jane. For Keng's review.
 *
 * Status: DRAFT. Not approved product copy. Do not film or ship as reviewed
 * until Keng signs off. Persona: warm Thai voice. Facts come only from the
 * approved answer-bank card as numbered sentences (or no card sentences).
 * The model returns JSON ids only; the app renders list text + verbatim
 * card sentences.
 *
 * The reply language is chosen by rules (`detectChatLang`), not by the model.
 * Thai turns keep this Thai persona (language line: ตอบเป็นภาษาไทย). English
 * turns use CHAT_SYSTEM_EN (language line: Reply in English.).
 *
 * Grounded at: chat-first plan, 29 Oct 2026 (warm, non-judgemental, short, no
 * roleplay). Safety stays: not medical advice, no sexual roleplay, Thai only,
 * no new hotlines. Thinking off is enforced by the adapter
 * (`enable_thinking: false` / `/no_think`), not by asking the model to "think".
 */

import type { ChatReplyOpts } from "./adapter";
import type { ChatLang } from "./chat-lang";
import { numberedCardSentences } from "./chat-sentences";
import { followUpsFor, openersFor } from "./chat-voice";

export const CHAT_SYSTEM_STATUS = "draft" as const;

export const CHAT_TEMPERATURE = 0.3;
export const CHAT_TOP_P = 0.9;
/** Cap output length. Structured JSON ids only; 40 is enough. */
export const CHAT_MAX_TOKENS = 40;

/**
 * Per-turn grounding. `facts` is the approved card's answer text (bank only),
 * or null when no card matched well enough. `strict` is the one retry.
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

/** DRAFT. JSON-only choice when a confident approved card is the only source. */
export const CHAT_GROUND_FACTS_TH =
  'ตอบเป็น JSON สั้นเท่านั้น รูปแบบ {"o":N,"s":[...],"q":N} ห้ามเขียนข้อความอื่น ' +
  "o คือรหัสประโยคเปิด s คือรหัสประโยคจากบัตรไม่เกินสามข้อตามลำดับห้ามซ้ำ q คือรหัสคำถามต่อ " +
  "ห้ามเพิ่มข้อเท็จจริงของตัวเอง ประโยคจากบัตร:";

export const CHAT_GROUND_NONE_TH =
  'ตอบเป็น JSON สั้นเท่านั้น รูปแบบ {"o":N,"s":[],"q":N} ห้ามเขียนข้อความอื่น ' +
  "ยังไม่มีบัตรที่ตรงพอ s ต้องเป็น [] " +
  "ห้ามให้ข้อเท็จจริง ตัวเลข คำสั่ง ราคา สายด่วน ลิงก์";

export const CHAT_GROUND_STRICT_TH =
  "รอบนี้ต้องเป็น JSON ที่ถูกต้องตามรูปแบบด้านบนเท่านั้น s ต้องเป็นรหัสที่มีในรายการ";

export const CHAT_GROUND_FACTS_EN =
  'Reply with short JSON only: {"o":N,"s":[...],"q":N}. No other text. ' +
  "o is the opener id, s is 0 to 3 card sentence ids in order with no duplicates, q is the follow-up id. " +
  "Do not add your own facts. Allowed card sentences:";

export const CHAT_GROUND_NONE_EN =
  'Reply with short JSON only: {"o":N,"s":[],"q":N}. No other text. ' +
  "No approved card matched well enough, so s must be []. No factual claims, numbers, instructions, prices, hotlines, or links.";

export const CHAT_GROUND_STRICT_EN =
  "This retry must be valid JSON in the format above. s may only use ids from the list.";

export const CHAT_GROUND_OPENERS_TH = "ประโยคเปิด (o):";
export const CHAT_GROUND_FOLLOWUPS_TH = "คำถามต่อ (q):";
export const CHAT_GROUND_OPENERS_EN = "Openers (o):";
export const CHAT_GROUND_FOLLOWUPS_EN = "Follow-ups (q):";

function numberedList(title: string, items: readonly string[]): string {
  return `${title}\n${items.map((s, i) => `${i}. ${s}`).join("\n")}`;
}

export function chatSystemFor(lang: ChatLang, opts?: ChatReplyOpts): string {
  const base = lang === "en" ? CHAT_SYSTEM_EN : CHAT_SYSTEM;
  const persona = opts?.ambiguous
    ? `${base} ${lang === "en" ? CHAT_SYSTEM_AMBIGUOUS_EN : CHAT_SYSTEM_AMBIGUOUS_TH}`
    : base;
  const g = opts?.grounding;
  if (!g) return persona;
  const factsIntro = lang === "en" ? CHAT_GROUND_FACTS_EN : CHAT_GROUND_FACTS_TH;
  const none = lang === "en" ? CHAT_GROUND_NONE_EN : CHAT_GROUND_NONE_TH;
  const strict = lang === "en" ? CHAT_GROUND_STRICT_EN : CHAT_GROUND_STRICT_TH;
  const openers = numberedList(
    lang === "en" ? CHAT_GROUND_OPENERS_EN : CHAT_GROUND_OPENERS_TH,
    openersFor(lang),
  );
  const follow = numberedList(
    lang === "en" ? CHAT_GROUND_FOLLOWUPS_EN : CHAT_GROUND_FOLLOWUPS_TH,
    followUpsFor(lang),
  );
  const parts = [persona];
  if (g.facts) parts.push(factsIntro, numberedCardSentences(g.facts), openers, follow);
  else parts.push(none, openers, follow);
  if (g.strict) parts.push(strict);
  return parts.join("\n");
}

export function chatUser(text: string): string {
  return text;
}

/** Strip think blocks / chat-template tokens from a raw chat completion. */
export function cleanChat(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\/no_think/g, "").replace(/<\|im_(start|end)\|>/g, "").trim();
}
