/**
 * Chat-first unanswered-message grouping. Pure. Never logs user text.
 *
 * Script/language gate is per message: if any counted message would take the
 * no-model path, the group takes it (card). Emoji-only messages do not count
 * either way.
 */

import { detectChatLang, modelChatScript, type ChatLang } from "../llm/chat-lang";

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const LETTER_RE = /\p{L}/u;

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
 * `allowMixed` is for chat-first AMBIGUOUS: leftover crisis-token Latin still
 * takes Thai chat. English stays off the model unless `allowEnglish` is true.
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
