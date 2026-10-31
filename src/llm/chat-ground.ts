/**
 * Chat-first grounding: the matcher's top approved card is the only factual
 * source. The model returns JSON ids (opener, whole-card flag, follow-up).
 * The app renders list text plus either nothing or the card's answer_th
 * verbatim. Invalid output: one retry, then the existing card fallback.
 * Never logs user text.
 */

import { ageAllowed, type AgeState } from "../core/age";
import type { BankCard } from "../core/bank";
import { isLockedRouteId } from "../core/pick-engine";
import type { Retrieval } from "../core/retrieve";
import type { ChatReplyOpts } from "./adapter";
import { formatChatReply, parseChatChoice, renderChatChoice, type ChatChoice } from "./chat-choice";
import { followUpsFor, openersFor } from "./chat-voice";
import { acceptChatReply, type ChatGuardReason } from "./chatGuard";
import type { ChatLang } from "./chat-lang";

export type { ChatGrounding } from "./chat-system";

export type GroundedFailReason = ChatGuardReason | "invalid";

export type GroundedAccept =
  | { ok: true; text: string; choice: ChatChoice }
  | { ok: false; reasons: GroundedFailReason[] };

/**
 * Well-enough = rules retrieval is confident on a shippable non-fallback card
 * that also passes the same age/eligibility gate as card display, and is not
 * a locked route. An 18+ card never reaches the model for an unverified or
 * underage context (facts stay null; display still redirects via afterPick).
 * Locked cards stay on the rules-locked path (0 model calls).
 */
export function groundingCard(
  retrieved: Retrieval,
  age: AgeState = null,
  fallbackId = "general.fallback.000",
): BankCard | null {
  if (!retrieved.confident) return null;
  const top = retrieved.ranked[0]?.card;
  if (!top || top.id === fallbackId) return null;
  if (isLockedRouteId(top.id)) return null;
  if (!ageAllowed(top, age)) return null;
  return top;
}

/**
 * Parse structured ids, then existing chatGuard on opener + follow-up (never
 * loosened). The card, if attached, is copied verbatim and is not model text.
 */
export function acceptGroundedChat(
  raw: string | null | undefined,
  lang: ChatLang,
  cardText: string | null | undefined,
  _opts?: ChatReplyOpts,
): GroundedAccept {
  const card = cardText == null ? "" : String(cardText);
  const hasCard = card.trim().length > 0;
  const parsed = parseChatChoice(raw, {
    openerCount: openersFor(lang).length,
    followUpCount: followUpsFor(lang).length,
    hasCard,
  });
  if (!parsed.ok) return { ok: false, reasons: ["invalid"] };
  const opener = openersFor(lang)[parsed.choice.o]!;
  const follow = followUpsFor(lang)[parsed.choice.q]!;
  const voice = formatChatReply(opener, "", follow);
  const guard = acceptChatReply(voice, lang);
  if (!guard.ok) return guard;
  return { ok: true, text: renderChatChoice(parsed.choice, lang, hasCard ? card : ""), choice: parsed.choice };
}
