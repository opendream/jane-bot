/**
 * Fixture-set measurement for grounded chat: trim + chatGuard + fact check.
 * No live model. Used by the unit test and by scripts/eval/grounded/measure.ts
 * so later per-arm dumps can reuse the same pipeline. Never logs user text.
 */

import type { BankCard } from "../core/bank";
import { acceptGroundedChat, type GroundedFailReason } from "./chat-ground";
import type { ChatLang } from "./chat-lang";

export interface GroundMeasureCase {
  id: string;
  /** Approved bank card id, or "" for the no-card path. */
  cardId: string;
  reply: string;
  lang?: ChatLang;
}

export interface GroundMeasureRow {
  id: string;
  accepted: boolean;
  reasons: GroundedFailReason[];
}

export interface GroundMeasureResult {
  rows: GroundMeasureRow[];
  accepted: number;
  fallback: number;
  total: number;
  fallbackRate: number;
}

export function measureGroundedReplies(
  cases: readonly GroundMeasureCase[],
  cards: readonly BankCard[],
): GroundMeasureResult {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const rows: GroundMeasureRow[] = [];
  for (const c of cases) {
    const card = c.cardId ? byId.get(c.cardId) : undefined;
    const facts = card?.answer_th ?? "";
    const acc = acceptGroundedChat(c.reply, c.lang ?? "th", facts);
    rows.push({
      id: c.id,
      accepted: acc.ok,
      reasons: acc.ok ? [] : acc.reasons,
    });
  }
  const accepted = rows.filter((r) => r.accepted).length;
  const fallback = rows.length - accepted;
  return {
    rows,
    accepted,
    fallback,
    total: rows.length,
    fallbackRate: rows.length ? fallback / rows.length : 0,
  };
}
