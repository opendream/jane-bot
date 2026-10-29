import type { BankCard } from "../../../src/core/bank";
import { ageAllowed, type AgeState } from "../../../src/core/age";
import { FALLBACK_ID } from "../../../src/core/dialog";
import { compact } from "../../../src/core/text";
import { isLockedCardId } from "./locked";

const K1 = 1.2;
const B = 0.75;

function charGrams(text: string): string[] {
  const t = compact(text);
  const grams: string[] = [];
  for (const n of [2, 3] as const) {
    if (t.length < n) continue;
    for (let i = 0; i <= t.length - n; i++) grams.push(t.slice(i, i + n));
  }
  return grams;
}

function tf(grams: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of grams) m.set(g, (m.get(g) ?? 0) + 1);
  return m;
}

/** Document text: triggers + title + key_facts (the card "summary"), not the full answer. */
export function cardBackupDoc(card: BankCard): string {
  return [card.title_th, ...(card.key_facts ?? []), ...(card.triggers ?? [])].join(" ");
}

/** Crisis is a rules screen, not a bank card today; still drop any future crisis-id card. */
export function isCrisisCardId(id: string): boolean {
  return /crisis/i.test(id);
}

export function backupPool(cards: readonly BankCard[], age: AgeState = null): BankCard[] {
  return cards.filter(
    (c) =>
      !isLockedCardId(c.id) &&
      !isCrisisCardId(c.id) &&
      c.id !== FALLBACK_ID &&
      ageAllowed(c, age),
  );
}

/**
 * Thai character 2–3-gram BM25 over triggers + title + key_facts.
 * Excludes locked cards, the fallback card, and age-ineligible cards. Eval-only.
 */
export function backupShortlist(
  query: string,
  cards: readonly BankCard[],
  opts: { k?: number; age?: AgeState } = {},
): BankCard[] {
  const k = opts.k ?? 3;
  const pool = backupPool(cards, opts.age ?? null);
  const docs = pool.map((card) => ({ card, tf: tf(charGrams(cardBackupDoc(card))) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const g of d.tf.keys()) df.set(g, (df.get(g) ?? 0) + 1);
  const N = docs.length || 1;
  const avgdl = docs.reduce((s, d) => s + [...d.tf.values()].reduce((a, b) => a + b, 0), 0) / N || 1;
  const qtf = tf(charGrams(query));
  const scored = docs.map((d, i) => {
    const dl = [...d.tf.values()].reduce((a, b) => a + b, 0) || 1;
    let score = 0;
    for (const [g, qf] of qtf) {
      const f = d.tf.get(g);
      if (!f) continue;
      const idf = Math.log(((N - (df.get(g) ?? 0) + 0.5) / ((df.get(g) ?? 0) + 0.5)) + 1);
      const denom = f + K1 * (1 - B + B * (dl / avgdl));
      score += qf * idf * ((f * (K1 + 1)) / denom);
    }
    return { card: d.card, score, i };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, k)
    .map((s) => s.card);
}
