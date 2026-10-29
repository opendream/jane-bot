import { afterEach, describe, expect, it } from "vitest";
import {
  bumpGenerationToken,
  currentGenerationToken,
  isCurrentGeneration,
  onGenerationTokenChange,
  resetGenerationTokenForTests,
  shouldSkipGeneration,
} from "../../src/llm/generation-token";

afterEach(() => {
  resetGenerationTokenForTests();
});

describe("generation token", () => {
  it("starts at 0 and bumping produces a new current id", () => {
    expect(currentGenerationToken()).toBe(0);
    const a = bumpGenerationToken();
    expect(a).toBe(1);
    expect(isCurrentGeneration(a)).toBe(true);
    const b = bumpGenerationToken();
    expect(b).toBe(2);
    expect(isCurrentGeneration(a)).toBe(false);
    expect(isCurrentGeneration(b)).toBe(true);
  });

  it("shouldSkipGeneration is true for a stale group or an aborted signal", () => {
    const a = bumpGenerationToken();
    expect(shouldSkipGeneration(a)).toBe(false);
    bumpGenerationToken();
    expect(shouldSkipGeneration(a)).toBe(true);
    const ac = new AbortController();
    ac.abort();
    expect(shouldSkipGeneration(undefined, ac.signal)).toBe(true);
    expect(shouldSkipGeneration(undefined)).toBe(false);
  });

  it("onGenerationTokenChange fires on bump", () => {
    let n = 0;
    const stop = onGenerationTokenChange(() => { n += 1; });
    bumpGenerationToken();
    bumpGenerationToken();
    expect(n).toBe(2);
    stop();
    bumpGenerationToken();
    expect(n).toBe(2);
  });
});
