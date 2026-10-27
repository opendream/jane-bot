import type { IntentResult } from "./types";
import type { BankCard, BankTopic } from "./bank";
import { classifyNeed } from "./intent";
import { findPhraseHits, type PhraseHit } from "./text";

/** Rules retrieval (plan §3 step 4): trigger hits + topic prior from classifyNeed() + current-topic boost. */
export const SHORTLIST = 5;
export const CONFIDENT_SCORE = 2;
export const CONFIDENT_MARGIN = 1;
export const WEIGHTS = { trigger: 2, priorTop: 1.5, priorOther: 0.75, context: 0.5 } as const;

export interface Scored { card: BankCard; score: number; triggerHits: number }
export interface Retrieval { ranked: Scored[]; confident: boolean; prior: IntentResult }

const NO_PRIOR: BankTopic[] = ["general", "ending", "quiz"];

function stronger(a: PhraseHit, b: PhraseHit): PhraseHit {
  return (a.end - a.start) >= (b.end - b.start) ? a : b;
}

/**
 * Unique trigger matches for one card. Whitespace-normalised twins and hits that occupy
 * the same span count once (keep the strongest). Distinct non-overlapping phrases still add.
 */
export function countTriggerHits(text: string, triggers: readonly string[]): number {
  return uniqueTriggerHits(text, triggers).unique;
}

function uniqueTriggerHits(text: string, triggers: readonly string[]): { unique: number; listed: number } {
  const hits = findPhraseHits(text, triggers);
  const byKey = new Map<string, PhraseHit>();
  for (const h of hits) {
    const prev = byKey.get(h.key);
    byKey.set(h.key, prev ? stronger(h, prev) : h);
  }
  const bySpan = new Map<string, PhraseHit>();
  for (const h of byKey.values()) {
    const sk = `${h.haystack}:${h.start}:${h.end}`;
    const prev = bySpan.get(sk);
    bySpan.set(sk, prev ? stronger(h, prev) : h);
  }
  return { unique: bySpan.size, listed: hits.length };
}

export function retrieve(text: string, cards: BankCard[], contextTopic: BankTopic | null = null): Retrieval {
  const prior = classifyNeed(text);
  const priorIdx = (t: BankTopic) => (NO_PRIOR.includes(t) || !prior.scores[t as keyof typeof prior.scores] ? -1 : prior.intents.indexOf(t as any));
  const scored = cards.map((card, i) => {
    const { unique: triggerHits, listed } = uniqueTriggerHits(text, card.triggers);
    let score = triggerHits * WEIGHTS.trigger;
    const p = priorIdx(card.topic);
    if (p === 0) score += WEIGHTS.priorTop; else if (p > 0) score += WEIGHTS.priorOther;
    // Context is a tie-breaker for cards that already scored (trigger or topic prior).
    // A context-only bump would keep the last topic forever and hide the honest fallback.
    if (contextTopic && card.topic === contextTopic && !NO_PRIOR.includes(card.topic) && (triggerHits > 0 || p >= 0)) {
      score += WEIGHTS.context;
    }
    return { card, score, triggerHits, listed, i };
  });
  // Equal unique scores: more listed matches first (preserves own-trigger ranking), then bank order.
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || b.listed - a.listed || a.i - b.i).slice(0, SHORTLIST)
    .map(({ card, score, triggerHits }) => ({ card, score, triggerHits }));
  const top = ranked[0]?.score ?? 0, second = ranked[1]?.score ?? 0;
  return { ranked, confident: top >= CONFIDENT_SCORE && top - second >= CONFIDENT_MARGIN, prior };
}
