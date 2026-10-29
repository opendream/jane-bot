/**
 * Strict structured chat choice: opener id, ordered card-sentence ids, follow-up id.
 * The app renders list text + verbatim card sentences. The model never writes
 * factual words. Never logs text.
 */

import type { ChatLang } from "./chat-lang";
import { followUpsFor, openersFor } from "./chat-voice";

export interface ChatChoice {
  o: number;
  s: number[];
  q: number;
}

export interface ChatChoiceBounds {
  openerCount: number;
  followUpCount: number;
  sentenceCount: number;
}

export type ParseChatChoice =
  | { ok: true; choice: ChatChoice }
  | { ok: false };

export function encodeChatChoice(choice: ChatChoice): string {
  return JSON.stringify({ o: choice.o, s: choice.s, q: choice.q });
}

export function formatChatReply(
  opener: string,
  sentences: readonly string[],
  followUp: string,
): string {
  return [opener, ...sentences, followUp].filter((p) => p.length > 0).join(" ");
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
  if (keys.length !== 3 || keys[0] !== "o" || keys[1] !== "q" || keys[2] !== "s") return { ok: false };
  const o = rec.o;
  const q = rec.q;
  const s = rec.s;
  if (!isInt(o) || o < 0 || o >= bounds.openerCount) return { ok: false };
  if (!isInt(q) || q < 0 || q >= bounds.followUpCount) return { ok: false };
  if (!Array.isArray(s) || s.length > 3) return { ok: false };
  if (bounds.sentenceCount <= 0 && s.length > 0) return { ok: false };
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const id of s) {
    if (!isInt(id) || id < 0 || id >= bounds.sentenceCount) return { ok: false };
    if (seen.has(id)) return { ok: false };
    seen.add(id);
    ids.push(id);
  }
  return { ok: true, choice: { o, s: ids, q } };
}

export function renderChatChoice(
  choice: ChatChoice,
  lang: ChatLang,
  sentences: readonly string[],
): string {
  const opener = openersFor(lang)[choice.o] ?? "";
  const follow = followUpsFor(lang)[choice.q] ?? "";
  const picked = choice.s.map((i) => sentences[i] ?? "").filter((p) => p.length > 0);
  return formatChatReply(opener, picked, follow);
}

/** Default stub / no-card choice: opener 0, no sentences, follow-up 0. */
export const DEFAULT_CHAT_CHOICE: ChatChoice = { o: 0, s: [], q: 0 };
export const DEFAULT_CHAT_CHOICE_JSON = encodeChatChoice(DEFAULT_CHAT_CHOICE);

export function defaultChatReply(lang: ChatLang): string {
  return renderChatChoice(DEFAULT_CHAT_CHOICE, lang, []);
}
