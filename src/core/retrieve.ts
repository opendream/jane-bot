import type { IntentResult } from "./types";
import { isAllTrigger, type BankCard, type BankTopic, type CardTrigger } from "./bank";
import { classifyNeed } from "./intent";
import { compact, findPhrases } from "./text";

/** Rules retrieval (plan §3 step 4): trigger hits + topic prior from classifyNeed() + current-topic boost. */
export const SHORTLIST = 5;
export const CONFIDENT_SCORE = 2;
export const CONFIDENT_MARGIN = 1;
export const WEIGHTS = { trigger: 2, priorTop: 1.5, priorOther: 0.75, context: 0.5 } as const;

export interface Scored { card: BankCard; score: number; triggerHits: number }
export interface Retrieval { ranked: Scored[]; confident: boolean; prior: IntentResult }

const NO_PRIOR: BankTopic[] = ["general", "ending", "quiz"];

function allGroupMatches(text: string, tokens: readonly string[]): boolean {
  return tokens.length >= 2 && tokens.every((tok) => typeof tok === "string" && tok.trim() && findPhrases(text, [tok]).length > 0);
}

function tokenSpans(text: string, tokens: readonly string[]): Array<{ start: number; end: number }> | null {
  const hay = compact(text);
  const spans: Array<{ start: number; end: number }> = [];
  for (const tok of tokens) {
    const k = compact(tok);
    if (!k) return null;
    const start = hay.indexOf(k);
    if (start < 0) return null;
    spans.push({ start, end: start + k.length });
  }
  return spans;
}

function spansCoveredBy(inner: Array<{ start: number; end: number }>, outer: Array<{ start: number; end: number }>): boolean {
  return inner.every((s) => outer.some((o) => o.start <= s.start && s.end <= o.end));
}

/** Matching `{ all }` groups, collapsing twins whose tokens sit inside another group's spans. */
function countAllGroupHits(text: string, groups: readonly string[][]): number {
  const matched: Array<{ spans: Array<{ start: number; end: number }>; len: number }> = [];
  for (const g of groups) {
    if (!allGroupMatches(text, g)) continue;
    const spans = tokenSpans(text, g);
    if (!spans) continue;
    matched.push({ spans, len: spans.reduce((n, s) => n + (s.end - s.start), 0) });
  }
  matched.sort((a, b) => b.len - a.len);
  const kept: typeof matched = [];
  for (const m of matched) {
    if (kept.some((k) => spansCoveredBy(m.spans, k.spans))) continue;
    kept.push(m);
  }
  return kept.length;
}

/**
 * Hits for one card. String triggers use findPhrases (unchanged). `{ all: tokens }` counts as
 * one extra hit when every token is present, in any order. Overlapping twin groups that reuse
 * the same query spans (ยาคุมฉุกเฉิน ⊃ คุมฉุกเฉิน, กี่ชั่วโมง ⊃ ชั่วโมง) count once.
 * String-only lists score identically to `findPhrases(text, triggers).length`.
 */
export function countTriggerHits(text: string, triggers: readonly CardTrigger[]): number {
  const phrases: string[] = [];
  const groups: string[][] = [];
  for (const t of triggers) {
    if (typeof t === "string") phrases.push(t);
    else if (isAllTrigger(t)) groups.push(t.all);
  }
  return findPhrases(text, phrases).length + countAllGroupHits(text, groups);
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
