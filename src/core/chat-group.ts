/**
 * Chat-first unanswered-message grouping. Pure. Never logs user text.
 *
 * Script/language gate is per message: if any counted message would take the
 * no-model path, the group takes it (card). Emoji-only messages do not count
 * either way.
 */

import { detectChatLang, modelChatScript, type ChatLang } from "../llm/chat-lang";
import { compact } from "./text";

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const LETTER_RE = /\p{L}/u;
const ACK_RE = /^(ขอบคุณ(ค่ะ|ครับ|นะ|คะ)?|ขอบใจ(ค่ะ|ครับ)?|thanks?(you)?|thankyou|thx|ตกลง(ค่ะ|ครับ)?|โอเค(ค่ะ|ครับ)?|okay|ok|รับทราบ|เข้าใจแล้ว)[!.,…ๆ]*$/u;
const ACK_PARTICLE_RE = /^(ค่ะ|ครับ|คะ|จ้า|จ้ะ|งับ)$/u;

/**
 * DRAFT. Keng review required before this string is treated as product copy.
 * Fixed local acknowledgement for a whole-line thanks/ack. Never generated.
 */
export const ACK_LINE_TH = "ยินดีค่ะ พี่อยู่ตรงนี้นะ";
export const ACK_LINE_TH_STATUS = "draft" as const;

/** True for thanks / short particles with no topic words. Never logs the line. */
export function isAckLine(text: string): boolean {
  const t = compact(text).replace(/[!.,?…ๆ]+$/g, "");
  if (!t) return false;
  return ACK_RE.test(t) || ACK_PARTICLE_RE.test(t);
}

/** Drop whole-line acks. Remaining lines keep every gate (lock, English, crisis). */
export function dropAckLines(messages: readonly string[]): string[] {
  return messages.filter((m) => !isAckLine(m));
}

/** True when the line has no letters and at least one emoji. */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (LETTER_RE.test(t)) return false;
  return EMOJI_RE.test(t);
}

export function combineUnanswered(messages: readonly string[]): string {
  return messages.join("\n");
}

export function countedGroupMessages(messages: readonly string[]): string[] {
  return messages.filter((m) => !isEmojiOnly(m));
}

/**
 * True when the group must take the no-model card path. Idle emoji-only is false.
 * `allowMixed` lets leftover crisis-token Latin take Thai chat. AMBIGUOUS
 * turns never reach this path. English stays off unless `allowEnglish` is true.
 */
export function groupTakesNoModelPath(
  messages: readonly string[],
  allowEnglish: boolean,
  allowMixed = false,
): boolean {
  const counted = countedGroupMessages(messages);
  if (!counted.length) return false;
  return counted.some((m) => {
    const script = modelChatScript(m);
    if (script === "th") return false;
    if (script === "en") return !allowEnglish;
    if (allowMixed) return false;
    return true;
  });
}

export function groupReplyLang(messages: readonly string[]): ChatLang {
  const counted = countedGroupMessages(messages);
  const sample = counted.length ? counted.join("\n") : messages.join("\n");
  return detectChatLang(sample);
}
