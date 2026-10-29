/** Cards the model must never pick. Rules answer them directly. Eval-only policy (PR 1). */
export const LOCKED_EXACT = new Set([
  "hiv.test.under18.000",
  "price.trc.prep.000",
  "urgent.pills.000",
]);

export const LOCKED_CARD_PREFIXES = ["ec.timing.", "price.trc.prep."] as const;

export function isLockedCardId(id: string): boolean {
  if (LOCKED_EXACT.has(id)) return true;
  return LOCKED_CARD_PREFIXES.some((p) => id.startsWith(p));
}
