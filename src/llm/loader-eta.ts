/**
 * Loader warm-up clock (D12). A flag-on turn waits only when the final warm-up
 * stage is running and reports ≤ WARMUP_WAIT_MAX_MS remaining; otherwise
 * rules-not-ready. Weights download is never covered by the thinking state.
 */

export const WARMUP_BUDGET_MS = 5_000;

export type LoaderPhase = "idle" | "weights" | "warmup" | "ready" | "failed";

interface LoaderEtaState {
  phase: LoaderPhase;
  warmupStartedAt: number | null;
  warmupBudgetMs: number;
}

const state: LoaderEtaState = {
  phase: "idle",
  warmupStartedAt: null,
  warmupBudgetMs: WARMUP_BUDGET_MS,
};

export function resetLoaderEta(): void {
  state.phase = "idle";
  state.warmupStartedAt = null;
  state.warmupBudgetMs = WARMUP_BUDGET_MS;
}

export function markLoaderWeights(): void {
  state.phase = "weights";
  state.warmupStartedAt = null;
}

export function beginWarmup(budgetMs: number = WARMUP_BUDGET_MS, now: number = Date.now()): void {
  state.phase = "warmup";
  state.warmupStartedAt = now;
  state.warmupBudgetMs = budgetMs;
}

export function markLoaderReady(): void {
  state.phase = "ready";
  state.warmupStartedAt = null;
}

export function markLoaderFailed(): void {
  state.phase = "failed";
  state.warmupStartedAt = null;
}

/** Remaining ms of the final warm-up stage; null if not in that stage. */
export function getWarmupRemainingMs(now: number = Date.now()): number | null {
  if (state.phase !== "warmup" || state.warmupStartedAt == null) return null;
  return Math.max(0, state.warmupBudgetMs - (now - state.warmupStartedAt));
}

export function loaderPhase(): LoaderPhase {
  return state.phase;
}
