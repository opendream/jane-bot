import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_CRISIS_CARD_FIRST, CHAT_FIRST, MODEL_CARD_PICK, chatCrisisEnabled, chatFirstEnabled, modelCardPickEnabled, shouldPreloadModel } from "../../src/config";
import { WLLAMA_N_CTX, WLLAMA_N_CTX_CHAT_FIRST, wllamaContextLength } from "../../src/llm/wllama-ctx";
import { draftSummary } from "../../src/core/summary";
import { SERVICES } from "../../src/core/referral";
import { classifyWithFallback, polishWithFallback, type LLMAdapter } from "../../src/llm/adapter";
import { toDialogModel } from "../../src/llm/dialogModel";
import type { ModelStatus } from "../../src/llm/runtime";
import { modelPillCopy, preloadModel, resetPreloadForTests, startModel } from "../../src/llm/runtime";

afterEach(() => {
  resetPreloadForTests();
});

const READY_PILL = "🔒 โมเดลในเครื่อง: Qwen3-1.7B · ออฟไลน์";
const s1663 = SERVICES.find((s) => s.id === "hotline_1663")!;

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
  it("keeps the base trigger: default search still starts the model", () => {
    expect(MODEL_CARD_PICK).toBe(false);
    expect(CHAT_FIRST).toBe(false);
    expect(CHAT_CRISIS_CARD_FIRST).toBe(true);
    expect(chatCrisisEnabled(false)).toBe(true);
    expect(chatCrisisEnabled(true)).toBe(true);
    expect(modelCardPickEnabled("")).toBe(false);
    expect(chatFirstEnabled("")).toBe(false);
    expect(shouldPreloadModel("")).toBe(true);
    expect(shouldPreloadModel("?modelPick=0")).toBe(true);
    expect(shouldPreloadModel("?model=off")).toBe(false);
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
  it("flag-off with weights loads the model; pill ready; classify, polish and WebGPU reword stay on", async () => {
    expect(MODEL_CARD_PICK).toBe(false);
    expect(modelCardPickEnabled("")).toBe(false);
    const classify = vi.fn(async () => ["contraception"]);
    const polishSummary = vi.fn(async (d: string) => d.replace("สิ่งที่อยากได้: อยาก", "สิ่งที่อยากได้: ต้องการ"));
    const rewordCard = vi.fn(async () => "ข้อความทดสอบ");
    const statuses: ModelStatus[] = [];
    const a = await preloadModel((s) => statuses.push({ ...s }), {
      search: "?model=qwen3-1.7b",
      gpuInfo: async () => ({ ok: true, f16: false }),
      installed: async () => [{ model: "qwen3-1.7b", variants: ["webgpu_f32", "wasm"] }],
      loadWebLLM: async (_b, label, onProgress) => {
        onProgress(1);
        return {
          name: `${label} (WebGPU)`,
          runtime: "webgpu",
          ready: () => true,
          classify,
          polishSummary,
          rewordCard,
        };
      },
    });
    expect(a?.runtime).toBe("webgpu");
    expect(a?.ready()).toBe(true);
    expect(statuses.at(-1)).toMatchObject({ state: "ready", runtime: "webgpu", label: "Qwen3-1.7B" });
    expect(modelPillCopy(statuses.at(-1)!).text).toBe(READY_PILL);

    const sorted = await classifyWithFallback("มีเรื่องอยากถาม ไม่รู้จะเริ่มยังไง", a);
    expect(sorted.source).toBe("model");
    expect(sorted.intents[0]).toBe("contraception");
    expect(classify).toHaveBeenCalled();

    const draft = draftSummary({ service: s1663, needText: "อยากได้ข้อมูล", intent: "contraception", ageBand: "unspecified" });
    const polished = await polishWithFallback(draft, a);
    expect(polishSummary).toHaveBeenCalled();
    expect(polished).toContain("ต้องการ");

    const dm = toDialogModel(a);
    expect(dm?.reword).toBeTypeOf("function");
    await dm!.reword!({ id: "ec.p000", answer_th: "ก", key_facts: ["ข"] } as any, new AbortController().signal);
    expect(rewordCard).toHaveBeenCalled();
  });

  it("?model=off still skips the fetch and worker", async () => {
    const installed = vi.fn(async () => [{ model: "qwen3-1.7b", variants: ["wasm"] }]);
    const loadWllama = vi.fn(async () => fakeWasm());
    const loadWebLLM = vi.fn(async () => fakeWasm());
    const statuses: ModelStatus[] = [];
    const a = await preloadModel((s) => statuses.push({ ...s }), {
      search: "?model=off",
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
      installed: async () => [{ model: "qwen3-0.6b-ft", variants: ["wasm"] }],
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

describe("wllama n_ctx (chat-first only)", () => {
  it("stays 1024 by default and becomes 2048 only when chat-first is on", () => {
    expect(WLLAMA_N_CTX).toBe(1024);
    expect(WLLAMA_N_CTX_CHAT_FIRST).toBe(2048);
    expect(wllamaContextLength(false)).toBe(1024);
    expect(wllamaContextLength(true)).toBe(2048);
  });

  it("startModel passes nCtx 2048 iff ?chatFirst=1", async () => {
    const loadOn = vi.fn(async (_f: string, _l: string, onP: (n: number) => void) => {
      onP(1);
      return fakeWasm();
    });
    await startModel(() => {}, {
      search: "?model=qwen3-1.7b&chatFirst=1&runtime=wasm",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed: async () => [{ model: "qwen3-1.7b", variants: ["wasm"] }],
      loadWllama: loadOn,
    });
    expect(loadOn.mock.calls[0][3]).toMatchObject({ nCtx: 2048, chatFirst: true });

    const loadOff = vi.fn(async (_f: string, _l: string, onP: (n: number) => void) => {
      onP(1);
      return fakeWasm();
    });
    await startModel(() => {}, {
      search: "?model=qwen3-1.7b&runtime=wasm",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed: async () => [{ model: "qwen3-1.7b", variants: ["wasm"] }],
      loadWllama: loadOff,
    });
    expect(loadOff.mock.calls[0][3]).toMatchObject({ nCtx: 1024, chatFirst: false });
  });
});
