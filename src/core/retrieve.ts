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

/** Overlapping spans in one haystack (compact Thai / norm Latin) become one cluster. */
function clusterOverlapping(hits: Iterable<PhraseHit>): PhraseHit[] {
  const byHaystack = new Map<PhraseHit["haystack"], PhraseHit[]>();
  for (const h of hits) {
    const list = byHaystack.get(h.haystack) ?? [];
    list.push(h);
    byHaystack.set(h.haystack, list);
  }
  const out: PhraseHit[] = [];
  for (const group of byHaystack.values()) {
    group.sort((a, b) => a.start - b.start || a.end - b.end);
    const clusters: { hit: PhraseHit; start: number; end: number }[] = [];
    for (const h of group) {
      const last = clusters[clusters.length - 1];
      if (last && h.start < last.end) {
        last.hit = stronger(last.hit, h);
        last.end = Math.max(last.end, h.end);
      } else {
        clusters.push({ hit: h, start: h.start, end: h.end });
      }
    }
    for (const c of clusters) out.push(c.hit);
  }
  return out;
}

/**
 * Unique trigger matches for one card. Whitespace-normalised twins count once.
 * Hits whose spans overlap in the space-stripped (or Latin-norm) text findPhrases
 * uses form one cluster, scored with the strongest match. Disjoint spans still add.
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
  return { unique: clusterOverlapping(byKey.values()).length, listed: hits.length };
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
