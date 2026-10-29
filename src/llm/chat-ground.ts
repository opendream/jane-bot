/**
 * Chat-first grounding: the matcher's top approved card is split into numbered
 * sentences. The model returns JSON ids (opener, sentence ids, follow-up).
 * The app renders list text + verbatim card sentences. Invalid output: one
 * retry, then the existing card fallback. Never logs user text.
 */

import { ageAllowed, type AgeState } from "../core/age";
import type { BankCard } from "../core/bank";
import type { Retrieval } from "../core/retrieve";
import type { ChatReplyOpts } from "./adapter";
import { formatChatReply, parseChatChoice, renderChatChoice } from "./chat-choice";
import { splitCardSentences } from "./chat-sentences";
import { followUpsFor, openersFor } from "./chat-voice";
import { acceptChatReply, type ChatGuardReason } from "./chatGuard";
import type { ChatLang } from "./chat-lang";

export type { ChatGrounding } from "./chat-system";

export type GroundedFailReason = ChatGuardReason | "invalid";

export type GroundedAccept =
  | { ok: true; text: string }
  | { ok: false; reasons: GroundedFailReason[] };

/**
 * Well-enough = rules retrieval is confident on a shippable non-fallback card
 * that also passes the same age/eligibility gate as card display. An 18+
 * card never reaches the model for an unverified or underage context
 * (facts stay null; display still redirects via afterPick).
 */
export function groundingCard(
  retrieved: Retrieval,
  age: AgeState = null,
  fallbackId = "general.fallback.000",
): BankCard | null {
  if (!retrieved.confident) return null;
  const top = retrieved.ranked[0]?.card;
  if (!top || top.id === fallbackId) return null;
  if (!ageAllowed(top, age)) return null;
  return top;
}

/**
 * Parse structured ids, then existing chatGuard on opener + follow-up (never
 * loosened). Card sentences are copied verbatim and are not model text.
 */
export function acceptGroundedChat(
  raw: string | null | undefined,
  lang: ChatLang,
  cardText: string | null | undefined,
  opts?: ChatReplyOpts,
): GroundedAccept {
  const sentences = (cardText ?? "").trim() ? splitCardSentences(cardText) : [];
  const parsed = parseChatChoice(raw, {
    openerCount: openersFor(lang).length,
    followUpCount: followUpsFor(lang).length,
    sentenceCount: sentences.length,
  });
  if (!parsed.ok) return { ok: false, reasons: ["invalid"] };
  const opener = openersFor(lang)[parsed.choice.o]!;
  const follow = followUpsFor(lang)[parsed.choice.q]!;
  const voice = formatChatReply(opener, [], follow);
  const guard = acceptChatReply(voice, lang, opts);
  if (!guard.ok) return guard;
  return { ok: true, text: renderChatChoice(parsed.choice, lang, sentences) };
}
