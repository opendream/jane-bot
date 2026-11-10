// Dev/test-only eval harness (not in the app build). Synthetic eval text only; nothing is logged or stored.
//   eval.html?runtime=wasm|webgpu&model=qwen3-1.7b|qwen3-4b
import { loadWllama } from "../llm/wllama-adapter";
import { loadWebLLM } from "../llm/webllm-adapter";
import { MODELS } from "../llm/models";
import { parseIntent } from "../llm/prompts";
import { classifyNeed } from "../core/intent";
import { classifyWithFallback } from "../llm/adapter";

const q = new URLSearchParams(location.search);
const runtime = q.get("runtime") ?? "wasm";
const spec = MODELS[(q.get("model") ?? "qwen3-1.7b") as keyof typeof MODELS];

async function gpuInfo() {
  const gpu = (navigator as any).gpu;
  if (!gpu) return null;
  const a = await gpu.requestAdapter({ powerPreference: "high-performance" });
  return a ? { vendor: a.info?.vendor, architecture: a.info?.architecture, f16: a.features.has("shader-f16"), fallback: !!(a.isFallbackAdapter || a.info?.isFallbackAdapter) } : null;
}

(window as any).evalReady = (async () => {
  const gpu = await gpuInfo();
  const t0 = performance.now();
  let a: any;
  if (runtime === "webgpu") {
    const v = gpu?.f16 ? "webgpu_f16" : "webgpu_f32";
    const build = spec[v];
    if (!build) throw new Error(`no ${v} build for ${spec.key}`);
    a = await loadWebLLM(build, spec.label, () => {});
    a.variant = v;
  } else {
    a = await loadWllama(spec.wasm!.file, spec.label, () => {});
    a.variant = "wasm";
  }
  const loadMs = performance.now() - t0;
  (window as any).evalOne = async (text: string) => {
    const s = performance.now();
    let raw = "", err = "", usage: any = null;
    try {
      const r = await a.classifyRaw(text);
      if (typeof r === "string") raw = r; else { raw = r.content; usage = r.usage; }
    } catch (e) { err = String(e); }
    const modelMs = performance.now() - s;
    const combined = await classifyWithFallback(text, a, 60_000);
    return { raw, err, usage, model: parseIntent(raw), modelMs, rules: classifyNeed(text), combined };
  };
  (window as any).evalPolish = async (line: string) => {
    if (!a.polishRaw) return null;
    const s = performance.now();
    const r = await a.polishRaw(line);
    return { ms: performance.now() - s, usage: r.usage, chars: r.content.length };
  };
  return { loadMs, threads: navigator.hardwareConcurrency, gpu, runtime, variant: a.variant, model: spec.label, ua: navigator.userAgent };
})();
