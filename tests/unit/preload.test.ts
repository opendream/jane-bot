import { afterEach, describe, expect, it, vi } from "vitest";
import { MODEL_CARD_PICK, modelCardPickEnabled, shouldPreloadModel } from "../../src/config";
import type { LLMAdapter } from "../../src/llm/adapter";
import type { ModelStatus } from "../../src/llm/runtime";
import { preloadModel, resetPreloadForTests, startModel } from "../../src/llm/runtime";

afterEach(() => {
  resetPreloadForTests();
});

function fakeWasm(label = "Qwen3-1.7B"): LLMAdapter {
  return {
    name: `${label} (WASM)`,
    runtime: "wasm",
    ready: () => true,
    classify: async () => ["other"],
    polishSummary: async () => null,
  };
}

describe("shouldPreloadModel (flag off by default)", () => {
  it("does not preload on the default search string", () => {
    expect(MODEL_CARD_PICK).toBe(false);
    expect(modelCardPickEnabled("")).toBe(false);
    expect(shouldPreloadModel("")).toBe(false);
    expect(shouldPreloadModel("?model=off")).toBe(false);
    expect(shouldPreloadModel("?modelPick=0")).toBe(false);
  });

  it("preloads when the flag is on, and still honours filming/runtime hooks", () => {
    expect(shouldPreloadModel("?modelPick=1")).toBe(true);
    expect(shouldPreloadModel("?runtime=wasm")).toBe(true);
    expect(shouldPreloadModel("?runtime=webgpu")).toBe(true);
    expect(shouldPreloadModel("?testRuntime=gpu-lost")).toBe(true);
    expect(shouldPreloadModel("?model=qwen3-1.7b")).toBe(true);
  });
});

describe("preloadModel", () => {
  it("flag-off never fetches installed models or starts a loader", async () => {
    const installed = vi.fn(async () => [{ model: "qwen3-1.7b", variants: ["wasm"] }]);
    const loadWllama = vi.fn(async () => fakeWasm());
    const loadWebLLM = vi.fn(async () => fakeWasm());
    const statuses: ModelStatus[] = [];
    const a = await preloadModel((s) => statuses.push({ ...s }), {
      search: "",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed,
      loadWllama,
      loadWebLLM,
    });
    expect(a).toBeNull();
    expect(installed).not.toHaveBeenCalled();
    expect(loadWllama).not.toHaveBeenCalled();
    expect(loadWebLLM).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toMatchObject({ state: "off", runtime: "rules" });
  });

  it("flag-on starts a single load at call time and does not retry after failure or a visibility bounce", async () => {
    let loads = 0;
    const loadWllama = vi.fn(async () => {
      loads += 1;
      throw new Error("mocked load failure");
    });
    const statuses: ModelStatus[] = [];
    const deps = {
      search: "?modelPick=1",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed: async () => [{ model: "qwen3-1.7b", variants: ["wasm"] }],
      loadWllama,
    };
    const first = preloadModel((s) => statuses.push({ ...s }), deps);
    const second = preloadModel((s) => statuses.push({ ...s }), deps);
    expect(second).toBe(first);
    expect(await first).toBeNull();
    expect(loads).toBe(1);
    expect(statuses.at(-1)?.state).toBe("failed");

    expect(await preloadModel(() => {}, deps)).toBeNull();
    expect(loads).toBe(1);
  });

  it("flag-on load starts immediately and does not block a later startModel test hook", async () => {
    const t0 = Date.now();
    let loadStartedAt = 0;
    const a = await startModel(() => {}, {
      search: "?modelPick=1&testRuntime=pick-ok&runtime=wasm",
    });
    loadStartedAt = Date.now() - t0;
    expect(a?.runtime).toBe("wasm");
    expect(loadStartedAt).toBeLessThan(500);
  });
});
