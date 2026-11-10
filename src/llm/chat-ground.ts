/**
 * Chat-first accept path: the local model writes free text. chatGuard is
 * never loosened. Invalid output: one retry, then the existing card fallback.
 * Never logs user text.
 */

import { ageAllowed, type AgeState } from "../core/age";
import type { BankCard } from "../core/bank";
import { isLockedRouteId } from "../core/pick-engine";
import type { Retrieval } from "../core/retrieve";
import type { ChatReplyOpts } from "./adapter";
import { acceptChatReply, type ChatGuardReason } from "./chatGuard";
import type { ChatLang } from "./chat-lang";

export type { ChatGrounding } from "./chat-system";

export type GroundedFailReason = ChatGuardReason | "invalid";

export type GroundedAccept =
  | { ok: true; text: string }
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
 * Guard the model's free-text reply. Card text is never mixed in: reviewed
 * cards are a fallback, shown separately.
 */
export function acceptGroundedChat(
  raw: string | null | undefined,
  lang: ChatLang,
  _cardText?: string | null,
  _opts?: ChatReplyOpts,
): GroundedAccept {
  const guard = acceptChatReply(raw, lang);
  if (!guard.ok) return guard;
  return { ok: true, text: guard.text };
}
