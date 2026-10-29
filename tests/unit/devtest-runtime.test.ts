import { afterEach, describe, expect, it, vi } from "vitest";
import type { LLMAdapter } from "../../src/llm/adapter";
import { resetPreloadForTests, startModel, type ModelStatus } from "../../src/llm/runtime";

afterEach(() => {
  resetPreloadForTests();
});

function fakeWasm(label: string): LLMAdapter {
  return {
    name: `${label} (WASM)`,
    runtime: "wasm",
    ready: () => true,
    classify: async () => ["other"],
    polishSummary: async () => null,
    async dispose() {},
  };
}

describe("startModel arm path (WASM only, on demand)", () => {
  it("loads the arm files via wllama and never asks WebGPU or installed.json", async () => {
    const loadWebLLM = vi.fn(async () => fakeWasm("gpu"));
    const loadWllama = vi.fn(async (file: string | string[], label: string, onProgress: (p: number) => void) => {
      expect(file).toBe("devtest/A-base.gguf");
      onProgress(1);
      return fakeWasm(label);
    });
    const installed = vi.fn(async () => [{ model: "qwen3-1.7b", variants: ["webgpu_f32", "wasm"] }]);
    const gpuInfo = vi.fn(async () => ({ ok: true, f16: true }));
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), {
      search: "?arm=A-base",
      arm: { files: "devtest/A-base.gguf", label: "A-base", cacheName: "devtest-weights-v1" },
      loadWebLLM,
      loadWllama,
      installed,
      gpuInfo,
    });
    expect(a?.runtime).toBe("wasm");
    expect(a?.name).toContain("A-base");
    expect(loadWllama).toHaveBeenCalledTimes(1);
    expect(loadWebLLM).not.toHaveBeenCalled();
    expect(installed).not.toHaveBeenCalled();
    expect(gpuInfo).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toMatchObject({ state: "ready", runtime: "wasm" });
  });

  it("passes shard lists through to loadWllama", async () => {
    const shards = ["devtest/B-tuned-00001-of-00002.gguf", "devtest/B-tuned-00002-of-00002.gguf"];
    const loadWllama = vi.fn(async (file: string | string[]) => {
      expect(file).toEqual(shards);
      return fakeWasm("B-tuned");
    });
    await startModel(() => {}, {
      arm: { files: shards, label: "B-tuned" },
      loadWllama,
      gpuInfo: async () => ({ ok: true, f16: false }),
      installed: async () => [],
    });
    expect(loadWllama).toHaveBeenCalled();
  });

  it("without an arm the default path is unchanged (still consults installed.json)", async () => {
    const installed = vi.fn(async () => [{ model: "qwen3-1.7b", variants: ["wasm"] }]);
    const loadWllama = vi.fn(async () => fakeWasm("Qwen3-1.7B"));
    await startModel(() => {}, {
      search: "",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed,
      loadWllama,
    });
    expect(installed).toHaveBeenCalled();
    expect(loadWllama).toHaveBeenCalled();
  });
});
