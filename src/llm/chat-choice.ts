/**
 * Strict structured chat choice: opener id, whole-card flag, follow-up id.
 * The app renders list text plus either nothing or the matched card's
 * answer_th verbatim. The model never writes factual words. Never logs text.
 */

import type { ChatLang } from "./chat-lang";
import { CARD_OFFER_FOLLOWUPS, followUpsFor, openersFor } from "./chat-voice";

export interface ChatChoice {
  o: number;
  c: 0 | 1;
  q: number;
}

export interface ChatChoiceBounds {
  openerCount: number;
  followUpCount: number;
  /** False when there is no card, the card is locked, or ageAllowed blocks it. */
  hasCard: boolean;
}

export type ParseChatChoice =
  | { ok: true; choice: ChatChoice }
  | { ok: false };

export function encodeChatChoice(choice: ChatChoice): string {
  return JSON.stringify({ o: choice.o, c: choice.c, q: choice.q });
}

export function formatChatReply(
  opener: string,
  cardText: string,
  followUp: string,
): string {
  return [opener, cardText, followUp].filter((p) => p.length > 0).join(" ");
}

function extractObject(raw: string | null | undefined): string | null {
  const t = (raw == null ? "" : String(raw)).trim();
  if (!t) return null;
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = (fence ? fence[1]! : t).trim();
  if (!body.startsWith("{") || !body.endsWith("}")) return null;
  return body;
}

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

export function parseChatChoice(
  raw: string | null | undefined,
  bounds: ChatChoiceBounds,
): ParseChatChoice {
  const body = extractObject(raw);
  if (!body) return { ok: false };
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return { ok: false };
  }
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return { ok: false };
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  if (keys.length !== 3 || keys[0] !== "c" || keys[1] !== "o" || keys[2] !== "q") return { ok: false };
  const o = rec.o;
  const q = rec.q;
  const c = rec.c;
  if (!isInt(o) || o < 0 || o >= bounds.openerCount) return { ok: false };
  if (!isInt(q) || q < 0 || q >= bounds.followUpCount) return { ok: false };
  if (!isInt(c) || (c !== 0 && c !== 1)) return { ok: false };
  if (c === 1 && !bounds.hasCard) return { ok: false };
  return { ok: true, choice: { o, c, q } };
}

/**
 * Turn-1 rule: if retrieval already has a confident ground card and no card
 * bubble will show, render c=1 whatever the model returned. Keeps o and q.
 * Pure. Does not close the topic.
 */
export function firstTurnChoice(
  choice: ChatChoice,
  opts: { topicTurn: number; hasGroundCard: boolean; cardBubble: boolean },
): ChatChoice {
  if (opts.topicTurn === 1 && opts.hasGroundCard && !opts.cardBubble) {
    return { o: choice.o, c: 1, q: choice.q };
  }
  return choice;
}

function followUpText(choice: ChatChoice, lang: ChatLang, cardShown: boolean): string {
  const follow = followUpsFor(lang)[choice.q] ?? "";
  if (cardShown && CARD_OFFER_FOLLOWUPS.has(follow)) {
    return followUpsFor(lang)[1] ?? follow;
  }
  return follow;
}

export function renderChatChoice(
  choice: ChatChoice,
  lang: ChatLang,
  cardText: string,
): string {
  const opener = openersFor(lang)[choice.o] ?? "";
  const follow = followUpText(choice, lang, choice.c === 1);
  const body = choice.c === 1 ? cardText : "";
  return formatChatReply(opener, body, follow);
}

/**
 * Final chat-bubble text for a turn. If the card bubble will also show,
 * treat c as 0 so answer_th appears once (on the card bubble).
 */
export function renderChatChoiceForTurn(
  choice: ChatChoice,
  lang: ChatLang,
  cardText: string,
  showCardBubble: boolean,
): string {
  const toRender = showCardBubble ? { o: choice.o, c: 0 as const, q: choice.q } : choice;
  const opener = openersFor(lang)[toRender.o] ?? "";
  const follow = followUpText(choice, lang, showCardBubble || choice.c === 1);
  const body = toRender.c === 1 ? cardText : "";
  return formatChatReply(opener, body, follow);
}

/** Default stub / no-card choice: opener 0, no card, follow-up 0. */
export const DEFAULT_CHAT_CHOICE: ChatChoice = { o: 0, c: 0, q: 0 };
export const DEFAULT_CHAT_CHOICE_JSON = encodeChatChoice(DEFAULT_CHAT_CHOICE);

export function defaultChatReply(lang: ChatLang): string {
  return renderChatChoice(DEFAULT_CHAT_CHOICE, lang, "");
}
