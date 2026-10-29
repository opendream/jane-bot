import { afterEach, describe, expect, it } from "vitest";
import {
  WARMUP_BUDGET_MS,
  beginWarmup,
  getWarmupRemainingMs,
  loaderPhase,
  markLoaderFailed,
  markLoaderReady,
  markLoaderWeights,
  resetLoaderEta,
} from "../../src/llm/loader-eta";

afterEach(() => resetLoaderEta());

describe("loader warm-up ETA", () => {
  it("is null outside the final warm-up stage", () => {
    expect(getWarmupRemainingMs()).toBeNull();
    markLoaderWeights();
    expect(loaderPhase()).toBe("weights");
    expect(getWarmupRemainingMs()).toBeNull();
    markLoaderReady();
    expect(getWarmupRemainingMs()).toBeNull();
    markLoaderFailed();
    expect(getWarmupRemainingMs()).toBeNull();
  });

  it("counts down from the warm-up budget and hits 0 after it elapses", () => {
    const t0 = 1_000_000;
    beginWarmup(WARMUP_BUDGET_MS, t0);
    expect(loaderPhase()).toBe("warmup");
    expect(getWarmupRemainingMs(t0)).toBe(WARMUP_BUDGET_MS);
    expect(getWarmupRemainingMs(t0 + 1_000)).toBe(WARMUP_BUDGET_MS - 1_000);
    expect(getWarmupRemainingMs(t0 + WARMUP_BUDGET_MS)).toBe(0);
    expect(getWarmupRemainingMs(t0 + WARMUP_BUDGET_MS + 50)).toBe(0);
  });
});
