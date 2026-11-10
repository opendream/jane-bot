/**
 * Fixture-set measurement for grounded chat: free-text chatGuard.
 * No live model. Used by the unit test and by scripts/eval/grounded/measure.ts
 * so later per-arm dumps can reuse the same pipeline. Never logs user text.
 */

import type { BankCard } from "../core/bank";
import { acceptGroundedChat, type GroundedFailReason } from "./chat-ground";
import type { ChatLang } from "./chat-lang";

export type GroundMeasureArm = "choice" | "invalid";

export interface GroundMeasureCase {
  id: string;
  /** Approved bank card id, or "" for the no-card path. */
  cardId: string;
  reply: string;
  lang?: ChatLang;
  /** choice = planted valid free-text; invalid = planted guard-failing text. */
  arm: GroundMeasureArm;
}

export interface GroundMeasureRow {
  id: string;
  arm: GroundMeasureArm;
  accepted: boolean;
  reasons: GroundedFailReason[];
}

export interface GroundArmStats {
  accepted: number;
  fallback: number;
  total: number;
  fallbackRate: number;
}

export interface GroundMeasureResult {
  rows: GroundMeasureRow[];
  accepted: number;
  fallback: number;
  total: number;
  fallbackRate: number;
  byArm: Record<GroundMeasureArm, GroundArmStats>;
}

function emptyArm(): GroundArmStats {
  return { accepted: 0, fallback: 0, total: 0, fallbackRate: 0 };
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
      arm: c.arm,
      accepted: acc.ok,
      reasons: acc.ok ? [] : acc.reasons,
    });
  }
  const accepted = rows.filter((r) => r.accepted).length;
  const fallback = rows.length - accepted;
  const byArm: Record<GroundMeasureArm, GroundArmStats> = {
    choice: emptyArm(),
    invalid: emptyArm(),
  };
  for (const row of rows) {
    const a = byArm[row.arm];
    a.total += 1;
    if (row.accepted) a.accepted += 1;
    else a.fallback += 1;
  }
  for (const a of Object.values(byArm)) {
    a.fallbackRate = a.total ? a.fallback / a.total : 0;
  }
  return {
    rows,
    accepted,
    fallback,
    total: rows.length,
    fallbackRate: rows.length ? fallback / rows.length : 0,
    byArm,
  };
}
