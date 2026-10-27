import type { IntentResult } from "./types";
import { isAllTrigger, type BankCard, type BankTopic, type CardTrigger } from "./bank";
import { classifyNeed } from "./intent";
import { findPhrases } from "./text";

/** Rules retrieval (plan §3 step 4): trigger hits + topic prior from classifyNeed() + current-topic boost. */
export const SHORTLIST = 5;
export const CONFIDENT_SCORE = 2;
export const CONFIDENT_MARGIN = 1;
export const WEIGHTS = { trigger: 2, priorTop: 1.5, priorOther: 0.75, context: 0.5 } as const;

export interface Scored { card: BankCard; score: number; triggerHits: number }
export interface Retrieval { ranked: Scored[]; confident: boolean; prior: IntentResult }

const NO_PRIOR: BankTopic[] = ["general", "ending", "quiz"];

/**
 * Hits for one card. String triggers use findPhrases (unchanged). `{ all: tokens }` counts as
 * one extra hit when every token is present, in any order. String-only lists score identically
 * to `findPhrases(text, triggers).length`.
 */
export function countTriggerHits(text: string, triggers: readonly CardTrigger[]): number {
  const phrases: string[] = [];
  const groups: string[][] = [];
  for (const t of triggers) {
    if (typeof t === "string") phrases.push(t);
    else if (isAllTrigger(t)) groups.push(t.all);
  }
  let n = findPhrases(text, phrases).length;
  for (const g of groups) {
    if (g.length >= 2 && g.every((tok) => typeof tok === "string" && tok.trim() && findPhrases(text, [tok]).length > 0)) n += 1;
  }
  return n;
}

export function retrieve(text: string, cards: BankCard[], contextTopic: BankTopic | null = null): Retrieval {
  const prior = classifyNeed(text);
  const priorIdx = (t: BankTopic) => (NO_PRIOR.includes(t) || !prior.scores[t as keyof typeof prior.scores] ? -1 : prior.intents.indexOf(t as any));
  const scored = cards.map((card, i) => {
    const triggerHits = countTriggerHits(text, card.triggers);
    let score = triggerHits * WEIGHTS.trigger;
    const p = priorIdx(card.topic);
    if (p === 0) score += WEIGHTS.priorTop; else if (p > 0) score += WEIGHTS.priorOther;
    // Context is a tie-breaker for cards that already scored (trigger or topic prior).
    // A context-only bump would keep the last topic forever and hide the honest fallback.
    if (contextTopic && card.topic === contextTopic && !NO_PRIOR.includes(card.topic) && (triggerHits > 0 || p >= 0)) {
      score += WEIGHTS.context;
    }
    return { card, score, triggerHits, i };
  });
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, SHORTLIST)
    .map(({ card, score, triggerHits }) => ({ card, score, triggerHits }));
  const top = ranked[0]?.score ?? 0, second = ranked[1]?.score ?? 0;
  return { ranked, confident: top >= CONFIDENT_SCORE && top - second >= CONFIDENT_MARGIN, prior };
}
