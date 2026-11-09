import { afterEach, describe, expect, it } from "vitest";
import { createGenerationQueue } from "../../src/llm/generation-queue";
import {
  bumpGenerationToken,
  resetGenerationTokenForTests,
  shouldSkipGeneration,
} from "../../src/llm/generation-token";

afterEach(() => {
  resetGenerationTokenForTests();
});

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(t); reject(new Error("aborted")); };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

describe("generation queue: cancel drops queued work and ignores late results", () => {
  it("a queued request whose group is stale returns without generating", async () => {
    const q = createGenerationQueue();
    const started: number[] = [];
    const a = bumpGenerationToken();
    const pA = q.run(a, undefined, async (s) => {
      started.push(a);
      await delay(40, s);
      return "A";
    });
    const b = bumpGenerationToken();
    const pB = q.run(b, undefined, async (s) => {
      started.push(b);
      await delay(10, s);
      return "B";
    });
    const c = bumpGenerationToken();
    const pC = q.run(c, undefined, async (s) => {
      started.push(c);
      await delay(10, s);
      return "C";
    });
    expect(await pA).toBeNull();
    expect(await pB).toBeNull();
    expect(await pC).toBe("C");
    expect(started).toEqual([a, c]);
    expect(shouldSkipGeneration(a)).toBe(true);
    expect(shouldSkipGeneration(b)).toBe(true);
  });

  it("the next turn is not delayed by an abandoned call that honours abort", async () => {
    const q = createGenerationQueue();
    const a = bumpGenerationToken();
    const ac = new AbortController();
    const pA = q.run(a, ac.signal, async (s) => {
      await delay(300, s);
      if (shouldSkipGeneration(a, s)) return null;
      return "late-A";
    });
    await delay(15);
    ac.abort();
    bumpGenerationToken();
    expect(await pA).toBeNull();

    const b = bumpGenerationToken();
    const t0 = Date.now();
    const out = await q.run(b, undefined, async (s) => {
      if (shouldSkipGeneration(b, s)) return null;
      return "B";
    });
    expect(out).toBe("B");
    expect(Date.now() - t0).toBeLessThan(80);
  });

  it("a late result from a call that ignores abort is discarded (WebGPU path)", async () => {
    const q = createGenerationQueue({ waitForPrevious: false });
    const a = bumpGenerationToken();
    let produced = "";
    const pA = q.run(a, undefined, async (s) => {
      await delay(60); // WebGPU generate may ignore AbortSignal
      produced = "A";
      if (shouldSkipGeneration(a, s)) return null;
      return "A";
    });
    const b = bumpGenerationToken();
    const t0 = Date.now();
    const pB = q.run(b, undefined, async () => "B");
    expect(await pB).toBe("B");
    expect(Date.now() - t0).toBeLessThan(50);
    expect(await pA).toBeNull();
    expect(produced).toBe("A");
    expect(shouldSkipGeneration(a)).toBe(true);
  });
});
