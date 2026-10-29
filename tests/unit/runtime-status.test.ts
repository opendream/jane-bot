import { afterEach, describe, expect, it, vi } from "vitest";
import type { LLMAdapter } from "../../src/llm/adapter";
import type { ModelStatus, StartModelDeps } from "../../src/llm/runtime";
import {
  GPU_FAIL_FLAG,
  clearGpuFailureForTests,
  gpuFailedThisSession,
  modelPillCopy,
  rememberGpuFailure,
  resetLoaderEta,
  startModel,
} from "../../src/llm/runtime";
import { bindWebLLMEngine, isWebGpuRuntimeFailure } from "../../src/llm/webllm-adapter";

// SYNTHETIC strings only. No user content, no secrets.

const LOST = "Device was lost. This can happen due to insufficient memory or other GPU constraints [GPUDeviceLostInfo]";
const DISPOSED = "The current Object has already been disposed";
const DROPPED = "Failed to pop error scopes: OperationError: Instance dropped in popErrorScope";
const INSTANCE = "A valid external Instance reference no longer exists";
const RULES_PILL = "🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์";
const READY_PILL = "🔒 โมเดลในเครื่อง: Qwen3-1.7B · ออฟไลน์";

type FailMode = "warmup-lost" | "generate-lost" | "disposed";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

function fakeWasm(label = "Qwen3-1.7B"): LLMAdapter {
  return {
    name: `${label} (WASM)`,
    runtime: "wasm",
    ready: () => true,
    classify: async () => ["other"],
    polishSummary: async () => null,
  };
}

function mockEngine(mode: FailMode | "ok") {
  let n = 0;
  const calls: { max_tokens?: number }[] = [];
  const unload = vi.fn(async () => {});
  return {
    calls,
    unload,
    chat: {
      completions: {
        create: async (req: { max_tokens?: number }) => {
          calls.push(req);
          n += 1;
          if (n === 1 && mode === "warmup-lost") throw new Error(LOST);
          if (n > 1 && mode === "generate-lost") throw new Error(LOST);
          if (n > 1 && mode === "disposed") throw new Error(DISPOSED);
          return { choices: [{ message: { content: '{"intent":"other"}' } }], usage: {} };
        },
      },
    },
  };
}

function mockWorker() {
  return { terminate: vi.fn(), addEventListener: vi.fn() };
}

async function loadMock(mode: FailMode | "ok", label = "Qwen3-1.7B") {
  const engine = mockEngine(mode);
  const worker = mockWorker();
  const adapter = await bindWebLLMEngine(engine, worker, label);
  return { adapter, engine, worker };
}

function lastOf(statuses: ModelStatus[]): ModelStatus {
  expect(statuses.length).toBeGreaterThan(0);
  return statuses[statuses.length - 1]!;
}

function readyOf(statuses: ModelStatus[], runtime: ModelStatus["runtime"]) {
  const hit = [...statuses].reverse().find((s) => s.state === "ready" && s.runtime === runtime);
  expect(hit, `expected a ready ${runtime} status`).toBeTruthy();
  return hit!;
}

async function waitStatus(statuses: ModelStatus[], pred: (s: ModelStatus) => boolean) {
  await vi.waitFor(() => {
    expect(statuses.some(pred), `status log: ${JSON.stringify(statuses)}`).toBe(true);
  });
}

function baseDeps(over: Partial<StartModelDeps> = {}): StartModelDeps {
  return {
    search: "",
    gpuInfo: async () => ({ ok: true, f16: false }),
    installed: async () => [{ model: "qwen3-1.7b", variants: ["webgpu_f32", "wasm"] }],
    storage: memoryStore(),
    loadWllama: async (_file, label, onProgress) => {
      onProgress(1);
      return fakeWasm(label);
    },
    ...over,
  };
}

afterEach(() => {
  clearGpuFailureForTests();
  resetLoaderEta();
});

describe("isWebGpuRuntimeFailure", () => {
  it("treats GPUDeviceLostInfo, worker drop, and disposed as runtime failure", () => {
    expect(isWebGpuRuntimeFailure(new Error(LOST))).toBe(true);
    expect(isWebGpuRuntimeFailure({ name: "GPUDeviceLostInfo", message: "Device was lost" })).toBe(true);
    expect(isWebGpuRuntimeFailure(new Error(DISPOSED))).toBe(true);
    expect(isWebGpuRuntimeFailure(new Error(DROPPED))).toBe(true);
    expect(isWebGpuRuntimeFailure(new Error(INSTANCE))).toBe(true);
    expect(isWebGpuRuntimeFailure(new Error("timeout"))).toBe(false);
  });
});

describe("model pill copy", () => {
  it("keeps the existing Thai labels for loading, ready, and rules-only", () => {
    expect(modelPillCopy({ state: "ready", runtime: "webgpu", label: "Qwen3-1.7B", progress: 1 }).text).toBe(READY_PILL);
    expect(modelPillCopy({ state: "ready", runtime: "wasm", label: "Qwen3-1.7B", progress: 1 }).text).toBe(READY_PILL);
    expect(modelPillCopy({ state: "ready", runtime: "webgpu", label: "Qwen3-1.7B", progress: 1 }).title).toContain("WebGPU");
    expect(modelPillCopy({ state: "ready", runtime: "wasm", label: "Qwen3-1.7B", progress: 1 }).title).toContain("WASM");
    expect(modelPillCopy({ state: "loading", runtime: "webgpu", label: "Qwen3-1.7B", progress: 0.4 }).text)
      .toBe("⏳ กำลังโหลดโมเดล Qwen3-1.7B 40% · ใช้งานได้ตามปกติระหว่างนี้");
    expect(modelPillCopy({ state: "loading", runtime: "rules", label: "", progress: 0 }).text)
      .toBe("⏳ กำลังตรวจหาโมเดลในเครื่อง · ใช้งานได้ตามปกติ");
    expect(modelPillCopy({ state: "failed", runtime: "rules", label: "", progress: 0 }).text).toBe(RULES_PILL);
    expect(modelPillCopy({ state: "off", runtime: "rules", label: "", progress: 0 }).text).toBe(RULES_PILL);
  });

  it("flag-on loading uses the readiness line; flag-off keeps the existing loading copy", () => {
    const loading = { state: "loading" as const, runtime: "wasm" as const, label: "Qwen3-1.7B", progress: 0.4 };
    expect(modelPillCopy(loading, { modelPick: true }).text).toBe("กำลังเตรียมพี่เจน…");
    expect(modelPillCopy(loading).text).toBe("⏳ กำลังโหลดโมเดล Qwen3-1.7B 40% · ใช้งานได้ตามปกติระหว่างนี้");
  });
});

describe("bindWebLLMEngine warm-up", () => {
  it("warms up with one short token and fails the load when the device is lost", async () => {
    const engine = mockEngine("warmup-lost");
    const worker = mockWorker();
    await expect(bindWebLLMEngine(engine, worker, "Qwen3-1.7B")).rejects.toThrow(/Device was lost|GPUDeviceLostInfo/);
    expect(engine.calls[0]?.max_tokens).toBe(1);
    expect(worker.terminate).toHaveBeenCalled();
    expect(engine.unload).toHaveBeenCalled();
  });
});

describe("startModel: WebGPU device lost during warm-up", () => {
  it("falls back to WASM and the pill matches ready-on-WASM", async () => {
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), baseDeps({
      loadWebLLM: async (_b, label, onProgress) => {
        onProgress(1);
        return (await loadMock("warmup-lost", label)).adapter;
      },
    }));
    expect(a?.runtime).toBe("wasm");
    expect(a?.ready()).toBe(true);
    const ready = readyOf(statuses, "wasm");
    expect(modelPillCopy(ready).text).toBe(READY_PILL);
    expect(ready.runtime).toBe("wasm");
    expect(statuses.some((s) => s.state === "ready" && s.runtime === "webgpu")).toBe(false);
  });

  it("falls back to rules when WASM is unavailable and the pill is the rules-only label", async () => {
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), baseDeps({
      installed: async () => [{ model: "qwen3-1.7b", variants: ["webgpu_f32"] }],
      loadWebLLM: async (_b, label) => (await loadMock("warmup-lost", label)).adapter,
      loadWllama: async () => { throw new Error("wasm mocked unavailable"); },
    }));
    expect(a).toBeNull();
    const last = lastOf(statuses);
    expect(last.runtime).toBe("rules");
    expect(last.state === "failed" || last.state === "off").toBe(true);
    expect(modelPillCopy(last).text).toBe(RULES_PILL);
  });
});

describe("startModel: WebGPU dies on the first generate", () => {
  it("switches to WASM after a device-lost generate, and the pill matches", async () => {
    const statuses: ModelStatus[] = [];
    let current: LLMAdapter | null = null;
    const a = await startModel((s) => statuses.push({ ...s }), baseDeps({
      onAdapter: (next) => { current = next; },
      loadWebLLM: async (_b, label, onProgress) => {
        onProgress(1);
        return (await loadMock("generate-lost", label)).adapter;
      },
    }));
    current = a;
    expect(a?.runtime).toBe("webgpu");
    expect(modelPillCopy(readyOf(statuses, "webgpu")).text).toBe(READY_PILL);
    await a!.classify("สวัสดี", new AbortController().signal).catch(() => null);
    await waitStatus(statuses, (s) => s.state === "ready" && s.runtime === "wasm");
    expect(current?.runtime).toBe("wasm");
    expect(current?.ready()).toBe(true);
    expect(modelPillCopy(readyOf(statuses, "wasm")).text).toBe(READY_PILL);
    expect(a!.ready()).toBe(false);
  });

  it("switches to WASM after a disposed generate, and the pill matches", async () => {
    const statuses: ModelStatus[] = [];
    let current: LLMAdapter | null = null;
    const a = await startModel((s) => statuses.push({ ...s }), baseDeps({
      onAdapter: (next) => { current = next; },
      loadWebLLM: async (_b, label, onProgress) => {
        onProgress(1);
        return (await loadMock("disposed", label)).adapter;
      },
    }));
    current = a;
    await a!.classify("สวัสดี", new AbortController().signal).catch(() => null);
    await waitStatus(statuses, (s) => s.state === "ready" && s.runtime === "wasm");
    expect(current?.runtime).toBe("wasm");
    expect(modelPillCopy(readyOf(statuses, "wasm")).text).toBe(READY_PILL);
  });

  it("falls back to rules when WASM is mocked unavailable after disposed", async () => {
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), baseDeps({
      installed: async () => [{ model: "qwen3-1.7b", variants: ["webgpu_f32"] }],
      loadWebLLM: async (_b, label, onProgress) => {
        onProgress(1);
        return (await loadMock("disposed", label)).adapter;
      },
    }));
    await a!.classify("สวัสดี", new AbortController().signal).catch(() => null);
    await waitStatus(statuses, (s) => s.runtime === "rules" && (s.state === "failed" || s.state === "off"));
    expect(modelPillCopy(lastOf(statuses)).text).toBe(RULES_PILL);
    expect(a!.ready()).toBe(false);
  });

  it("does not wait for WASM before the current generate returns (verbatim/rules, no delay)", async () => {
    let releaseWasm!: (a: LLMAdapter) => void;
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), baseDeps({
      loadWebLLM: async (_b, label, onProgress) => {
        onProgress(1);
        return (await loadMock("disposed", label)).adapter;
      },
      loadWllama: () => new Promise<LLMAdapter>((resolve) => { releaseWasm = resolve; }),
    }));
    const classifyDone = a!.classify("สวัสดี", new AbortController().signal).then(() => "ok", () => "ok");
    await expect(classifyDone).resolves.toBe("ok");
    const afterGenerate = lastOf(statuses);
    expect(afterGenerate.state === "ready" && afterGenerate.runtime === "webgpu").toBe(false);
    releaseWasm(fakeWasm());
    await waitStatus(statuses, (s) => s.state === "ready" && s.runtime === "wasm");
  });
});

describe("startModel test hooks for model-first pick", () => {
  it("pick-ok exposes pickCard and a warmupRemainingMs callback", async () => {
    const a = await startModel(() => {}, { search: "?testRuntime=pick-ok&runtime=wasm" });
    expect(a?.runtime).toBe("wasm");
    expect(a?.pickCard).toBeTypeOf("function");
    expect(a?.warmupRemainingMs).toBeTypeOf("function");
    const id = await a!.pickCard!("ทดสอบ", [{ id: "birth.control.000", title_th: "คุมกำเนิด" }], null, new AbortController().signal);
    expect(id).toContain("birth.control.000");
  });

  it("pick-warmup remaining is ≤ 5 s and not-ready; pick-warmup-slow remaining is > 5 s", async () => {
    const warm = await startModel(() => {}, { search: "?testRuntime=pick-warmup&runtime=wasm" });
    const left = warm?.warmupRemainingMs?.() ?? 0;
    expect(warm?.ready()).toBe(false);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(5_000);

    const slow = await startModel(() => {}, { search: "?testRuntime=pick-warmup-slow&runtime=wasm" });
    expect(slow?.ready()).toBe(false);
    expect(slow?.warmupRemainingMs?.() ?? 0).toBeGreaterThan(5_000);
  });
});

describe("GPU failure memory (session only, no personal data)", () => {
  it("remembers a single non-personal flag so the next start skips WebGPU", async () => {
    const storage = memoryStore();
    rememberGpuFailure(storage);
    expect(gpuFailedThisSession(storage)).toBe(true);
    expect(storage.getItem(GPU_FAIL_FLAG)).toBe("1");

    let webgpuTried = 0;
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), baseDeps({
      storage,
      loadWebLLM: async () => {
        webgpuTried += 1;
        throw new Error("should not retry a broken GPU");
      },
    }));
    expect(webgpuTried).toBe(0);
    expect(a?.runtime).toBe("wasm");
    expect(modelPillCopy(readyOf(statuses, "wasm")).text).toBe(READY_PILL);
  });

  it("stores the flag when warm-up loses the device", async () => {
    const storage = memoryStore();
    await startModel(() => {}, baseDeps({
      storage,
      loadWebLLM: async (_b, label) => (await loadMock("warmup-lost", label)).adapter,
    }));
    expect(storage.getItem(GPU_FAIL_FLAG)).toBe("1");
    expect(gpuFailedThisSession(storage)).toBe(true);
  });
});
