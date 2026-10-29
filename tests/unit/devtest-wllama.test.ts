import { beforeEach, describe, expect, it, vi } from "vitest";

const { exit, loadModel, createChatCompletion, cachedBlob } = vi.hoisted(() => ({
  exit: vi.fn(async () => {}),
  loadModel: vi.fn(async () => {}),
  createChatCompletion: vi.fn(async () => ({ choices: [{ message: { content: "{}" } }] })),
  cachedBlob: vi.fn(async (path: string) => new Blob([path])),
}));

vi.mock("@wllama/wllama", () => ({
  Wllama: class {
    exit = exit;
    loadModel = loadModel;
    createChatCompletion = createChatCompletion;
  },
}));
vi.mock("@wllama/wllama/esm/wasm/wllama.wasm?url", () => ({ default: "/wllama.wasm" }));
vi.mock("../../src/llm/weights-cache", () => ({
  WEIGHTS_CACHE: "model-weights-v1",
  cachedBlob: (...args: unknown[]) => cachedBlob(...args),
  keepOnlyCachedPaths: vi.fn(),
  deleteNamedCache: vi.fn(),
  modelUrl: (p: string) => p,
}));

describe("loadWllama dispose and shards (mocked wllama)", () => {
  beforeEach(() => {
    exit.mockClear();
    loadModel.mockClear();
    createChatCompletion.mockClear();
    cachedBlob.mockClear();
    vi.stubGlobal("navigator", { hardwareConcurrency: 4 });
  });

  it("loads one or many blobs and dispose() calls Wllama.exit()", async () => {
    const { loadWllama } = await import("../../src/llm/wllama-adapter");
    const a = await loadWllama("gguf/one.gguf", "A-base", () => {});
    expect(cachedBlob).toHaveBeenCalledTimes(1);
    expect(loadModel.mock.calls[0]![0]).toHaveLength(1);
    await a.dispose?.();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(a.ready()).toBe(false);

    cachedBlob.mockClear();
    loadModel.mockClear();
    const b = await loadWllama(["devtest/s1.gguf", "devtest/s2.gguf"], "B-tuned", () => {}, { cacheName: "devtest-weights-v1" });
    expect(cachedBlob).toHaveBeenCalledTimes(2);
    expect(cachedBlob.mock.calls[0]?.[2]).toBe("devtest-weights-v1");
    expect(loadModel.mock.calls[0]![0]).toHaveLength(2);
    await b.dispose?.();
    expect(exit).toHaveBeenCalledTimes(2);
  });
});
