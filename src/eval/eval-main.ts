// Dev-only: exposes the WASM adapter to the Playwright eval script. Synthetic eval text only; nothing is logged or stored.
import { loadWllama } from "../llm/wllama-adapter";
import { MODELS } from "../llm/models";
import { parseIntent } from "../llm/prompts";
import { classifyNeed } from "../core/intent";
import { classifyWithFallback } from "../llm/adapter";

(window as any).evalReady = (async () => {
  const spec = MODELS["qwen3-1.7b"];
  const t0 = performance.now();
  const a = await loadWllama(spec.wasm!.file, spec.label, () => {});
  const loadMs = performance.now() - t0;
  (window as any).evalOne = async (text: string) => {
    const s = performance.now();
    let raw = "", err = "";
    try { raw = await a.classifyRaw(text); } catch (e) { err = String(e); }
    const modelMs = performance.now() - s;
    const s2 = performance.now();
    const combined = await classifyWithFallback(text, a, 60_000);
    return { raw, err, model: parseIntent(raw), modelMs, rules: classifyNeed(text), combined, combinedMs: performance.now() - s2 };
  };
  return { loadMs, threads: navigator.hardwareConcurrency };
})();
