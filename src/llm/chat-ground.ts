/**
 * Chat-first grounding: the matcher's top approved card is the only allowed
 * source in the system prompt. After generate, trim + chatGuard + fact check
 * (add-only). One retry with a stricter line, then the existing card fallback.
 * Never logs user text.
 */

import type { BankCard } from "../core/bank";
import type { Retrieval } from "../core/retrieve";
import { acceptChatReply, type ChatGuardReason } from "./chatGuard";
import { acceptChatFacts, type FactCheckReason } from "./chat-factcheck";
import type { ChatLang } from "./chat-lang";
import { trimToLastCompleteSentence } from "./chat-trim";

export type { ChatGrounding } from "./chat-system";

export type GroundedFailReason = ChatGuardReason | FactCheckReason | "incomplete";

export type GroundedAccept =
  | { ok: true; text: string }
  | { ok: false; reasons: GroundedFailReason[] };

/**
 * Well-enough = rules retrieval is confident on a shippable non-fallback card.
 * Weak / empty matches leave facts null so the model may only give a short
 * warm no-fact reply and point at ขอข้อมูลเลย.
 */
export function groundingCard(retrieved: Retrieval, fallbackId = "general.fallback.000"): BankCard | null {
  if (!retrieved.confident) return null;
  const top = retrieved.ranked[0]?.card;
  if (!top || top.id === fallbackId) return null;
  return top;
}

/**
 * Trim to a complete sentence, then existing chatGuard, then the add-only
 * fact check against card text (empty string = no card, so any planted fact fails).
 */
export function acceptGroundedChat(
  raw: string | null | undefined,
  lang: ChatLang,
  cardText: string | null | undefined,
): GroundedAccept {
  const trimmed = trimToLastCompleteSentence(raw);
  if (!trimmed) return { ok: false, reasons: ["incomplete"] };
  const guard = acceptChatReply(trimmed, lang);
  if (!guard.ok) return guard;
  const facts = acceptChatFacts(trimmed, cardText ?? "");
  if (!facts.ok) return { ok: false, reasons: facts.reasons };
  return { ok: true, text: guard.text };
}
