import { Wllama } from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import type { LLMAdapter } from "./adapter";
import type { Intent } from "../core/types";
import { cachedBlob } from "./weights-cache";
import { CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, POLISH_SYSTEM, cleanPolished, parseIntent } from "./prompts";
import { replaceNeedLine, needLine } from "./summary-lines";

/** llama.cpp compiled to WASM, CPU only (n_gpu_layers 0). Works with no GPU at all. */
export async function loadWllama(file: string, label: string, onProgress: (p: number) => void): Promise<LLMAdapter> {
  const blob = await cachedBlob(file, (l, t) => onProgress(t ? (0.9 * l) / t : 0));
  onProgress(0.92);
  const w = new Wllama({ default: wasmUrl }, { suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error() {} } as any });
  await w.loadModel([blob], { n_ctx: 1024, n_gpu_layers: 0, n_threads: Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4)) });
  onProgress(1);
  let busy: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = busy.then(fn, fn); busy = p.catch(() => null); return p; };
  return {
    name: `${label} (WASM)`,
    ready: () => true,
    classify: (text, signal) => serial(async () => {
      const r: any = await w.createChatCompletion({
        messages: [{ role: "system", content: CLASSIFY_SYSTEM }, { role: "user", content: `${text} /no_think` }],
        max_tokens: 20, temperature: 0, abortSignal: signal,
        response_format: { type: "json_schema", json_schema: { name: "intent", schema: CLASSIFY_SCHEMA } },
      } as any);
      return parseIntent(r.choices?.[0]?.message?.content ?? "") as Intent[] | null;
    }),
    polishSummary: (draft, signal) => serial(async () => {
      const line = needLine(draft);
      if (!line) return null;
      const r: any = await w.createChatCompletion({
        messages: [{ role: "system", content: POLISH_SYSTEM }, { role: "user", content: `${line} /no_think` }],
        max_tokens: 60, temperature: 0, abortSignal: signal,
      } as any);
      const out = cleanPolished(r.choices?.[0]?.message?.content ?? "");
      return out ? replaceNeedLine(draft, out) : null;
    }),
  };
}
