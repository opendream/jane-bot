import { MODEL, chatFirstEnabled, shouldPreloadModel } from "../config";
import { detectChatLang } from "./chat-lang";
import { wllamaContextLength } from "./wllama-ctx";
import { MODELS, type ModelSpec, type WebGpuBuild } from "./models";
import type { LLMAdapter } from "./adapter";
import {
  GPU_FAIL_FLAG,
  clearGpuFailureForTests,
  gpuFailedThisSession,
  isWebGpuRuntimeFailure,
  rememberGpuFailure,
  type StorageLike,
} from "./gpu-failure";
import {
  beginWarmup,
  getWarmupRemainingMs,
  markLoaderFailed,
  markLoaderReady,
  markLoaderWeights,
  resetLoaderEta,
} from "./loader-eta";
import { READINESS_LINE } from "../ui/thinking";
import { shouldSkipGeneration } from "./generation-token";

export type Runtime = "webgpu" | "wasm" | "rules";
export interface ModelStatus {
  state: "off" | "loading" | "ready" | "failed";
  runtime: Runtime;
  label: string;
  progress: number;
}

interface Installed { model: string; variants: string[] }

export interface StartModelDeps {
  search?: string;
  gpuInfo?: () => Promise<{ ok: boolean; f16: boolean }>;
  installed?: () => Promise<Installed[]>;
  loadWebLLM?: (build: WebGpuBuild, label: string, onProgress: (p: number) => void, opts?: { onDead?: (err: Error) => void; onWarmup?: (ms: number) => void }) => Promise<LLMAdapter>;
  loadWllama?: (file: string, label: string, onProgress: (p: number) => void, opts?: { onWarmup?: (ms: number) => void; nCtx?: number; chatFirst?: boolean }) => Promise<LLMAdapter>;
  storage?: StorageLike;
  onAdapter?: (a: LLMAdapter | null) => void;
  testRuntime?: string | null;
}

export type RuntimeTestHook = {
  webllm?: "warmup-lost" | "generate-lost" | "disposed";
  wasm?: "ok" | "unavailable";
  gpu?: boolean;
  /** Mock card-pick worker (e2e / unit). */
  pick?: "ok" | "timeout" | "not-ready" | "warmup" | "warmup-slow" | "loading" | "fail" | "none";
  /** Stubbed chatReply delay in ms (e2e thinking indicator). Never user text. */
  chatDelayMs?: number;
};

export {
  GPU_FAIL_FLAG,
  clearGpuFailureForTests,
  gpuFailedThisSession,
  rememberGpuFailure,
  getWarmupRemainingMs,
  resetLoaderEta,
};

const LOST_MSG = "Device was lost. This can happen due to insufficient memory or other GPU constraints [GPUDeviceLostInfo]";
const DISPOSED_MSG = "The current Object has already been disposed";

/** Honest Thai + English copy for the header pill. Rules-only text is the existing label. */
export function modelPillCopy(m: ModelStatus, opts?: { modelPick?: boolean }): { text: string; title: string } {
  if (m.state === "ready") {
    return {
      text: `🔒 โมเดลในเครื่อง: ${m.label} · ออฟไลน์`,
      title: `On-device model: ${m.label} (${m.runtime === "webgpu" ? "WebGPU" : "WASM, CPU"}) / offline`,
    };
  }
  if (opts?.modelPick && m.state === "loading") {
    return { text: READINESS_LINE, title: "Preparing the on-device model" };
  }
  if (m.state === "loading" && m.runtime !== "rules") {
    return {
      text: `⏳ กำลังโหลดโมเดล ${m.label} ${Math.round(m.progress * 100)}% · ใช้งานได้ตามปกติระหว่างนี้`,
      title: `Loading on-device model ${m.label}; the referral flow works meanwhile (rules)`,
    };
  }
  if (m.state === "loading") {
    return { text: "⏳ กำลังตรวจหาโมเดลในเครื่อง · ใช้งานได้ตามปกติ", title: "Checking for an on-device model" };
  }
  return { text: "🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์", title: "Rules only, no model / offline" };
}

/** Real GPU only: SwiftShader / fallback adapters produce garbage and ~0.1 tok/s (spike, 22 Oct). */
async function gpuInfo(): Promise<{ ok: boolean; f16: boolean }> {
  const gpu = (navigator as any).gpu;
  if (!gpu) return { ok: false, f16: false };
  try {
    const a = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!a) return { ok: false, f16: false };
    const arch = String(a.info?.architecture ?? "").toLowerCase();
    const vendor = String(a.info?.vendor ?? "").toLowerCase();
    if (a.isFallbackAdapter || a.info?.isFallbackAdapter || arch.includes("swiftshader") || (vendor === "google" && arch === "")) return { ok: false, f16: false };
    return { ok: true, f16: a.features.has("shader-f16") };
  } catch { return { ok: false, f16: false }; }
}

async function installed(): Promise<Installed[]> {
  try {
    const r = await fetch(new URL("models/installed.json", document.baseURI), { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()).installed ?? [];
  } catch { return []; }
}

function readTestHook(deps: StartModelDeps, params: URLSearchParams): RuntimeTestHook | null {
  const fromUrl = deps.testRuntime !== undefined ? deps.testRuntime : params.get("testRuntime");
  if (fromUrl === "gpu-lost") return { webllm: "warmup-lost", wasm: "ok", gpu: true };
  if (fromUrl === "gpu-lost-rules") return { webllm: "warmup-lost", wasm: "unavailable", gpu: true };
  if (fromUrl === "gpu-disposed") return { webllm: "disposed", wasm: "ok", gpu: true };
  if (fromUrl === "pick-ok") return { wasm: "ok", gpu: false, pick: "ok" };
  if (fromUrl === "pick-timeout") return { wasm: "ok", gpu: false, pick: "timeout" };
  if (fromUrl === "pick-not-ready") return { pick: "not-ready", gpu: false, wasm: "unavailable" };
  if (fromUrl === "pick-warmup") return { wasm: "ok", gpu: false, pick: "warmup" };
  if (fromUrl === "pick-warmup-slow") return { wasm: "ok", gpu: false, pick: "warmup-slow" };
  if (fromUrl === "pick-loading") return { wasm: "ok", gpu: false, pick: "loading" };
  if (fromUrl === "pick-fail") return { wasm: "ok", gpu: false, pick: "fail" };
  if (fromUrl === "chat-ok") return { wasm: "ok", gpu: false, pick: "none" };
  if (fromUrl === "chat-slow") return { wasm: "ok", gpu: false, pick: "none", chatDelayMs: 1_500 };
  try {
    if (typeof window !== "undefined" && window.__JANE_RUNTIME_TEST__) return window.__JANE_RUNTIME_TEST__;
  } catch { /* node unit tests */ }
  return null;
}

function noteCall(kind: "chat" | "pick"): void {
  try {
    const g = globalThis as unknown as { __JANE_RUNTIME_CALLS__?: { chat: number; pick: number } };
    g.__JANE_RUNTIME_CALLS__ ??= { chat: 0, pick: 0 };
    g.__JANE_RUNTIME_CALLS__[kind]++;
  } catch { /* node unit tests without a window */ }
}

function mockPickCard(hook: RuntimeTestHook): LLMAdapter["pickCard"] | undefined {
  if (!hook.pick || hook.pick === "not-ready" || hook.pick === "fail") return undefined;
  return async (_text, shortlist, _prev, signal) => {
    noteCall("pick");
    if (hook.pick === "timeout") {
      await new Promise<void>((_resolve, reject) => {
        const onAbort = () => reject(new Error("aborted"));
        if (signal?.aborted) return onAbort();
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    const id = hook.pick === "none" ? "none" : (shortlist[0]?.id ?? "none");
    return JSON.stringify({ id });
  };
}

/** Synthetic structured choice for the chat-first e2e stub. Never user text. */
const MOCK_CHAT_REPLY = '{"o":0,"s":[],"q":0}';
const MOCK_CHAT_REPLY_EN = '{"o":0,"s":[],"q":0}';

function mockChatDelayMs(hook: RuntimeTestHook): number {
  try {
    const q = Number(new URLSearchParams(typeof location !== "undefined" ? location.search : "").get("chatReplyMs") || "");
    if (Number.isFinite(q) && q > 0) return q;
  } catch { /* node unit tests */ }
  return hook.chatDelayMs ?? 0;
}

function mockChatReply(hook: RuntimeTestHook): LLMAdapter["chatReply"] | undefined {
  if (!hook.pick || hook.pick === "not-ready" || hook.pick === "fail") return undefined;
  return async (text, _history, signal, _lang, groupId) => {
    if (shouldSkipGeneration(groupId, signal)) return null;
    const delay = mockChatDelayMs(hook);
    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        const onAbort = () => { clearTimeout(t); reject(new Error("aborted")); };
        if (signal?.aborted) return onAbort();
        signal?.addEventListener("abort", onAbort, { once: true });
      }).catch(() => null);
      if (shouldSkipGeneration(groupId, signal)) return null;
    }
    noteCall("chat");
    return detectChatLang(text) === "en" ? MOCK_CHAT_REPLY_EN : MOCK_CHAT_REPLY;
  };
}

function hookLoaders(hook: RuntimeTestHook): Pick<StartModelDeps, "gpuInfo" | "installed" | "loadWebLLM" | "loadWllama"> {
  try {
    const g = globalThis as unknown as { __JANE_RUNTIME_CALLS__?: { chat: number; pick: number } };
    g.__JANE_RUNTIME_CALLS__ ??= { chat: 0, pick: 0 };
  } catch { /* node */ }
  const pickCard = mockPickCard(hook);
  const chatReply = mockChatReply(hook);
  return {
    gpuInfo: async () => ({ ok: hook.gpu !== false, f16: false }),
    installed: async () => {
      if (hook.pick === "not-ready") return [];
      return [{
        model: "qwen3-1.7b",
        variants: hook.wasm === "unavailable" ? ["webgpu_f32"] : ["webgpu_f32", "wasm"],
      }];
    },
    loadWebLLM: async (_b, label, onProgress) => {
      onProgress(1);
      if (hook.webllm === "warmup-lost" || !hook.webllm) throw new Error(LOST_MSG);
      let dead = false;
      const fail = () => {
        dead = true;
        throw new Error(hook.webllm === "disposed" ? DISPOSED_MSG : LOST_MSG);
      };
      return {
        name: `${label} (WebGPU)`,
        runtime: "webgpu" as const,
        ready: () => !dead,
        classify: async () => fail(),
        polishSummary: async () => fail(),
        pickCard,
        chatReply,
        warmupRemainingMs: () => getWarmupRemainingMs(),
        dispose() { dead = true; },
      };
    },
    loadWllama: async (_file, label, onProgress, opts) => {
      if (hook.wasm === "unavailable") throw new Error("wasm mocked unavailable");
      if (hook.pick === "fail") throw new Error("mocked load failure");
      if (hook.pick === "loading") {
        onProgress(0.05);
        await new Promise((r) => setTimeout(r, 8_000));
      }
      const warmupMs = hook.pick === "warmup" ? 700 : hook.pick === "warmup-slow" ? 8_000 : 0;
      if (warmupMs) {
        opts?.onWarmup?.(warmupMs);
        onProgress(0.96);
      }
      onProgress(1);
      const readyAt = warmupMs ? Date.now() + warmupMs : 0;
      return {
        name: `${label} (WASM)`,
        runtime: "wasm" as const,
        ready: () => !readyAt || Date.now() >= readyAt,
        classify: async () => ["other"],
        polishSummary: async () => null,
        pickCard,
        chatReply,
        warmupRemainingMs: () => {
          if (!readyAt) return getWarmupRemainingMs();
          const left = readyAt - Date.now();
          return left > 0 ? left : null;
        },
      };
    },
  };
}

function isWebGpuAdapter(a: LLMAdapter): boolean {
  return a.runtime === "webgpu" || a.name.includes("WebGPU");
}

function watchWebGpu(adapter: LLMAdapter, onFail: () => void): LLMAdapter {
  let failed = false;
  const trip = () => {
    if (failed) return;
    failed = true;
    onFail();
  };
  const guard = <T>(p: Promise<T>): Promise<T> => p.then((v) => {
    if (!adapter.ready()) trip();
    return v;
  }, (e) => {
    if (isWebGpuRuntimeFailure(e) || !adapter.ready()) trip();
    throw e;
  });
  return {
    get name() { return adapter.name; },
    get runtime() { return "webgpu" as const; },
    ready: () => !failed && adapter.ready(),
    classify: (text, signal) => guard(adapter.classify(text, signal)),
    polishSummary: (draft, signal) => guard(adapter.polishSummary(draft, signal)),
    pickCard: adapter.pickCard
      ? (text, shortlist, prev, signal) => guard(adapter.pickCard!(text, shortlist, prev, signal))
      : undefined,
    rewordCard: adapter.rewordCard
      ? (card, signal) => guard(adapter.rewordCard!(card, signal))
      : undefined,
    chatReply: adapter.chatReply
      ? (text, history, signal, lang, groupId, opts) => guard(adapter.chatReply!(text, history, signal, lang, groupId, opts))
      : undefined,
    warmupRemainingMs: adapter.warmupRemainingMs ? () => adapter.warmupRemainingMs!() : () => getWarmupRemainingMs(),
    dispose: () => adapter.dispose?.(),
  };
}

function withLoaderEta(a: LLMAdapter): LLMAdapter {
  if (a.warmupRemainingMs) return a;
  return { ...a, warmupRemainingMs: () => getWarmupRemainingMs() };
}

let preloadOnce: Promise<LLMAdapter | null> | null = null;

export function resetPreloadForTests(): void {
  preloadOnce = null;
}

/**
 * Start the model once at app open (same trigger as v2/answer-bank-chat).
 * `?model=off` skips the fetch. A finished or failed load is never restarted
 * (including after a backgrounded tab). MODEL_CARD_PICK does not gate this.
 */
export function preloadModel(onStatus: (s: ModelStatus) => void, deps: StartModelDeps = {}): Promise<LLMAdapter | null> {
  const search = deps.search ?? (typeof location !== "undefined" ? location.search : "");
  if (!shouldPreloadModel(search)) {
    onStatus({ state: "off", runtime: "rules", label: "", progress: 0 });
    return Promise.resolve(null);
  }
  if (preloadOnce) return preloadOnce;
  preloadOnce = startModel(onStatus, { ...deps, search }).then(
    (a) => a,
    () => {
      onStatus({ state: "failed", runtime: "rules", label: "", progress: 0 });
      return null;
    },
  );
  return preloadOnce;
}

/**
 * Starts the best available model in the background. Never throws; the referral flow keeps working on rules.
 * Order: WebGPU (real GPU) → WASM (CPU) → rules.
 * A dead GPU (device lost / worker drop / disposed) is a runtime failure, not "ready": tear down WebLLM
 * and fall back to WASM when installed. A single non-personal sessionStorage flag skips retrying that GPU.
 */
export async function startModel(onStatus: (s: ModelStatus) => void, deps: StartModelDeps = {}): Promise<LLMAdapter | null> {
  resetLoaderEta();
  markLoaderWeights();
  const search = deps.search ?? (typeof location !== "undefined" ? location.search : "");
  const params = new URLSearchParams(search);
  const hook = readTestHook(deps, params);
  const hooked = hook ? hookLoaders(hook) : {};
  const gpuInfoFn = deps.gpuInfo ?? hooked.gpuInfo ?? gpuInfo;
  const installedFn = deps.installed ?? hooked.installed ?? installed;
  const loadWebLLMFn = deps.loadWebLLM ?? hooked.loadWebLLM;
  const loadWllamaFn = deps.loadWllama ?? hooked.loadWllama;
  const storage = deps.storage;
  const onAdapter = deps.onAdapter;

  const forced = params.get("runtime");
  const key = (params.get("model") ?? MODEL) as ModelSpec["key"] | "off";
  const rules = (state: ModelStatus["state"]) => {
    markLoaderFailed();
    onStatus({ state, runtime: "rules", label: "", progress: 0 });
    onAdapter?.(null);
  };
  if (key === "off" || !(key in MODELS)) { rules("off"); return null; }
  const spec = MODELS[key as ModelSpec["key"]];
  const inst = await installedFn();
  const has = (m: string, v: string) => inst.some((i) => i.model === m && i.variants.includes(v));
  const wSpec = spec.wasm ? spec : spec.wasmFallback ? MODELS[spec.wasmFallback] : null;

  type Step = { runtime: "webgpu" | "wasm"; run: () => Promise<LLMAdapter> };
  const plan: Step[] = [];
  let gpuDead: (() => void) | null = null;
  const skipGpu = gpuFailedThisSession(storage) && forced !== "webgpu";
  const gpu = forced === "wasm" || skipGpu ? { ok: false, f16: false } : await gpuInfoFn();
  if ((gpu.ok || forced === "webgpu") && !skipGpu) {
    const v = gpu.f16 && has(spec.key, "webgpu_f16") ? "webgpu_f16" : has(spec.key, "webgpu_f32") ? "webgpu_f32" : null;
    if (v) plan.push({
      runtime: "webgpu",
      run: async () => {
        const load = loadWebLLMFn ?? (await import("./webllm-adapter")).loadWebLLM;
        onStatus({ state: "loading", runtime: "webgpu", label: spec.label, progress: 0 });
        return load(spec[v as "webgpu_f16"], spec.label, (p) => onStatus({ state: "loading", runtime: "webgpu", label: spec.label, progress: p }), {
          onDead: () => gpuDead?.(),
          onWarmup: (ms) => beginWarmup(ms),
        });
      },
    });
  }
  if (forced !== "webgpu") {
    if (wSpec?.wasm && has(wSpec.key, "wasm")) plan.push({
      runtime: "wasm",
      run: async () => {
        const load = loadWllamaFn ?? (await import("./wllama-adapter")).loadWllama;
        onStatus({ state: "loading", runtime: "wasm", label: wSpec.label, progress: 0 });
        return load(wSpec.wasm!.file, wSpec.label, (p) => onStatus({ state: "loading", runtime: "wasm", label: wSpec.label, progress: p }), {
          onWarmup: (ms) => beginWarmup(ms),
          nCtx: wllamaContextLength(chatFirstEnabled(search)),
          chatFirst: chatFirstEnabled(search),
        });
      },
    });
  }

  const wasmStep = plan.find((s) => s.runtime === "wasm");
  const ready = (a: LLMAdapter) => {
    markLoaderReady();
    const wrapped = withLoaderEta(a);
    const runtime: Runtime = wrapped.runtime ?? (isWebGpuAdapter(wrapped) ? "webgpu" : "wasm");
    onStatus({ state: "ready", runtime, label: wrapped.name.replace(/ \((WebGPU|WASM)\)$/, ""), progress: 1 });
    onAdapter?.(wrapped);
    return wrapped;
  };

  let recovering = false;
  const recoverFromGpu = (dead: LLMAdapter) => {
    if (recovering) return;
    recovering = true;
    rememberGpuFailure(storage);
    onAdapter?.(null);
    if (wasmStep) onStatus({ state: "loading", runtime: "wasm", label: wSpec?.label ?? spec.label, progress: 0 });
    else onStatus({ state: "failed", runtime: "rules", label: "", progress: 0 });
    void (async () => {
      try { await dead.dispose?.(); } catch { /* teardown */ }
      if (!wasmStep) return;
      try { ready(await wasmStep.run()); } catch { rules("failed"); }
    })();
  };

  for (const step of plan) {
    try {
      const a = await step.run();
      if (step.runtime === "webgpu" || isWebGpuAdapter(a)) {
        const watched = watchWebGpu(a, () => recoverFromGpu(a));
        gpuDead = () => recoverFromGpu(a);
        return ready(watched);
      }
      return ready(a);
    } catch {
      if (step.runtime === "webgpu") rememberGpuFailure(storage);
      /* try the next runtime; never log user content (none is involved here) */
    }
  }
  rules(plan.length ? "failed" : "off");
  return null;
}
