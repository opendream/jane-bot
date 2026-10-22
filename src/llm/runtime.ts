import { MODEL } from "../config";
import { MODELS, type ModelSpec } from "./models";
import type { LLMAdapter } from "./adapter";

export type Runtime = "webgpu" | "wasm" | "rules";
export interface ModelStatus {
  state: "off" | "loading" | "ready" | "failed";
  runtime: Runtime;
  label: string;
  progress: number;
}

interface Installed { model: string; variants: string[] }

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

/**
 * Starts the best available model in the background. Never throws; the referral flow keeps working on rules.
 * Order: WebGPU (real GPU) → WASM (CPU) → rules.
 */
export async function startModel(onStatus: (s: ModelStatus) => void): Promise<LLMAdapter | null> {
  const params = new URLSearchParams(location.search);
  const forced = params.get("runtime");
  const key = (params.get("model") ?? MODEL) as ModelSpec["key"] | "off";
  const rules = (state: ModelStatus["state"]) => onStatus({ state, runtime: "rules", label: "", progress: 0 });
  if (key === "off" || !(key in MODELS)) { rules("off"); return null; }
  const spec = MODELS[key as ModelSpec["key"]];
  const inst = await installed();
  const has = (m: string, v: string) => inst.some((i) => i.model === m && i.variants.includes(v));

  const plan: (() => Promise<LLMAdapter>)[] = [];
  const gpu = forced === "wasm" ? { ok: false, f16: false } : await gpuInfo();
  if (gpu.ok || forced === "webgpu") {
    const v = gpu.f16 && has(spec.key, "webgpu_f16") ? "webgpu_f16" : has(spec.key, "webgpu_f32") ? "webgpu_f32" : null;
    if (v) plan.push(async () => {
      const { loadWebLLM } = await import("./webllm-adapter");
      onStatus({ state: "loading", runtime: "webgpu", label: spec.label, progress: 0 });
      return loadWebLLM(spec[v as "webgpu_f16"], spec.label, (p) => onStatus({ state: "loading", runtime: "webgpu", label: spec.label, progress: p }));
    });
  }
  if (forced !== "webgpu") {
    const wSpec = spec.wasm ? spec : spec.wasmFallback ? MODELS[spec.wasmFallback] : null;
    if (wSpec?.wasm && has(wSpec.key, "wasm")) plan.push(async () => {
      const { loadWllama } = await import("./wllama-adapter");
      onStatus({ state: "loading", runtime: "wasm", label: wSpec.label, progress: 0 });
      return loadWllama(wSpec.wasm!.file, wSpec.label, (p) => onStatus({ state: "loading", runtime: "wasm", label: wSpec.label, progress: p }));
    });
  }
  for (const step of plan) {
    try {
      const a = await step();
      const runtime: Runtime = a.name.includes("WebGPU") ? "webgpu" : "wasm";
      onStatus({ state: "ready", runtime, label: a.name.replace(/ \((WebGPU|WASM)\)$/, ""), progress: 1 });
      return a;
    } catch {
      /* try the next runtime; never log user content (none is involved here) */
    }
  }
  rules(plan.length ? "failed" : "off");
  return null;
}
