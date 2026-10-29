import { Wllama } from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import type { LLMAdapter } from "./adapter";
import type { Intent } from "../core/types";
import { cachedBlob } from "./weights-cache";
import { CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, POLISH_SYSTEM, PICK_SYSTEM, PICK_MAX_TOKENS, REWORD_SYSTEM, REWORD_MAX_TOKENS, cleanPolished, cleanReword, parseIntent, pickSchema, pickUser, rewordUser } from "./prompts";
import { replaceNeedLine, needLine } from "./summary-lines";
import { WARMUP_BUDGET_MS } from "./loader-eta";

/** llama.cpp compiled to WASM, CPU only (n_gpu_layers 0). Works with no GPU at all. */
export async function loadWllama(
  file: string | string[],
  label: string,
  onProgress: (p: number) => void,
  opts?: { onWarmup?: (budgetMs: number) => void; cacheName?: string },
): Promise<LLMAdapter & { classifyRaw(text: string, signal?: AbortSignal): Promise<string> }> {
  const paths = Array.isArray(file) ? file : [file];
  const blobs: Blob[] = [];
  for (let i = 0; i < paths.length; i++) {
    const blob = await cachedBlob(paths[i], (loaded, total) => {
      const part = total ? loaded / total : 1;
      onProgress((0.9 * (i + part)) / paths.length);
    }, opts?.cacheName);
    blobs.push(blob);
  }
  onProgress(0.92);
  const w = new Wllama({ default: wasmUrl }, { suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error() {} } as any });
  await w.loadModel(blobs, { n_ctx: 1024, n_gpu_layers: 0, n_threads: Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4)) });
  onProgress(0.96);
  opts?.onWarmup?.(WARMUP_BUDGET_MS);
  let busy: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = busy.then(fn, fn); busy = p.catch(() => null); return p; };
  const classifyRaw = (text: string, signal?: AbortSignal) => serial(async () => {
    const r: any = await w.createChatCompletion({
      messages: [{ role: "system", content: CLASSIFY_SYSTEM }, { role: "user", content: `${text} /no_think` }],
      max_tokens: 24, temperature: 0, abortSignal: signal,
      response_format: { type: "json_schema", json_schema: { name: "intent", schema: CLASSIFY_SCHEMA } },
    } as any);
    return String(r.choices?.[0]?.message?.content ?? "");
  });
  // Warm-up on a fixed synthetic string (never user text): the first inference is ~4x slower and
  // would otherwise hit the 8 s classify timeout on her first message.
  await classifyRaw("สวัสดี").catch(() => "");
  onProgress(1);
  let alive = true;
  return {
    name: `${label} (WASM)`,
    runtime: "wasm" as const,
    classifyRaw,
    ready: () => alive,
    classify: async (text, signal) => parseIntent(await classifyRaw(text, signal)) as Intent[] | null,
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
    pickCard: (text, shortlist, prev, signal) => serial(async () => {
      const r: any = await w.createChatCompletion({
        messages: [{ role: "system", content: PICK_SYSTEM }, { role: "user", content: `${pickUser(text, shortlist, prev)} /no_think` }],
        max_tokens: PICK_MAX_TOKENS, temperature: 0, abortSignal: signal,
        response_format: { type: "json_schema", json_schema: { name: "pick", schema: pickSchema(shortlist.map((s) => s.id)) } },
      } as any);
      return String(r.choices?.[0]?.message?.content ?? "");
    }),
    // Defined for completeness; off on WASM by default (REWORD_RUNTIMES, p90 3.3 s on the studio Mac).
    rewordCard: (card, signal) => serial(async () => {
      const r: any = await w.createChatCompletion({
        messages: [{ role: "system", content: REWORD_SYSTEM }, { role: "user", content: `${rewordUser(card)} /no_think` }],
        max_tokens: REWORD_MAX_TOKENS, temperature: 0, abortSignal: signal,
      } as any);
      return cleanReword(String(r.choices?.[0]?.message?.content ?? "")) || null;
    }),
    async dispose() {
      if (!alive) return;
      alive = false;
      try { await w.exit(); } catch { /* already torn down */ }
    },
  };
}
