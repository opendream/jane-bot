import type { CrisisCategory } from "./types";
import { CRISIS_PRIORITY as PINNED_PRIORITY, crisisOrder as pinnedCrisisOrder } from "./crisis";

/** Mixed/unclear uses the pinned default order from crisis.ts (empty categories). */
const ALL_FOUR = pinnedCrisisOrder([]);

function fromPinned(cat: CrisisCategory, order: readonly string[]): readonly string[] {
  const known = new Set(PINNED_PRIORITY[cat]);
  return order.filter((n) => known.has(n));
}

/** Helplines for a single-category crisis screen (owner ruling 23 Oct 2026). Mixed/unclear → all four. */
export const CRISIS_PRIORITY: Record<CrisisCategory, readonly string[]> = {
  self_harm: fromPinned("self_harm", ["1323", "1669"]),
  sexual_violence: fromPinned("sexual_violence", ["191", "1300"]),
  violence_danger: fromPinned("violence_danger", ["1300", "191"]),
  medical_emergency: fromPinned("medical_emergency", ["1669"]),
};

export function crisisOrder(categories: CrisisCategory[]): string[] {
  const unique = [...new Set(categories)];
  if (unique.length !== 1) return [...ALL_FOUR];
  return [...CRISIS_PRIORITY[unique[0]]];
}
