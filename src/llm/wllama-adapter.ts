import { Wllama } from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import type { LLMAdapter } from "./adapter";
import type { Intent } from "../core/types";
import { cachedBlob } from "./weights-cache";
import { CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, POLISH_SYSTEM, PICK_SYSTEM, PICK_MAX_TOKENS, REWORD_SYSTEM, REWORD_MAX_TOKENS, cleanPolished, cleanReword, parseIntent, pickSchema, pickUser, rewordUser } from "./prompts";
import { CHAT_MAX_TOKENS, CHAT_TEMPERATURE, CHAT_TOP_P, WLLAMA_NO_THINK_KWARGS, buildWllamaChatPrompt, chatSystemFor } from "./chat-system";
import { detectChatLang } from "./chat-lang";
import { wllamaContextLength } from "./wllama-ctx";
import { shouldSkipGeneration } from "./generation-token";
import { createChatRuntime } from "./chat-engine";
import { CHAT_WARMUP_LANG, CHAT_WARMUP_MAX_TOKENS, CHAT_WARMUP_USER } from "./chat-warmup";
import { replaceNeedLine, needLine } from "./summary-lines";
import { WARMUP_BUDGET_MS } from "./loader-eta";

/** llama.cpp compiled to WASM, CPU only (n_gpu_layers 0). Works with no GPU at all. */
export async function loadWllama(
  file: string,
  label: string,
  onProgress: (p: number) => void,
  opts?: { onWarmup?: (budgetMs: number) => void; nCtx?: number; chatFirst?: boolean },
): Promise<LLMAdapter & { classifyRaw(text: string, signal?: AbortSignal): Promise<string> }> {
  const blob = await cachedBlob(file, (l, t) => onProgress(t ? (0.9 * l) / t : 0));
  onProgress(0.92);
  const w = new Wllama({ default: wasmUrl }, { suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error() {} } as any });
  const n_ctx = opts?.nCtx ?? wllamaContextLength(!!opts?.chatFirst);
  await w.loadModel([blob], {
    n_ctx, n_gpu_layers: 0, n_threads: Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4)),
    // Jinja so GGUF chat templates (Qwen3 enable_thinking) actually run.
    jinja: true,
    default_template_kwargs: { ...WLLAMA_NO_THINK_KWARGS },
  });
  onProgress(0.96);
  opts?.onWarmup?.(WARMUP_BUDGET_MS);
  // One exclusive generate for classify/pick/chat/warm-up (issue #49). Chat
  // warm-up runs only when chat-first is on; card-first classify never shares
  // the engine with a background chat generate.
  const runtime = createChatRuntime({ chatFirst: opts?.chatFirst, waitForPrevious: true });
  const noThink = { chat_template_kwargs: { ...WLLAMA_NO_THINK_KWARGS } };
  const classifyRaw = (text: string, signal?: AbortSignal) => runtime.classifyOrPick(async () => {
    const r: any = await w.createChatCompletion({
      messages: [{ role: "system", content: CLASSIFY_SYSTEM }, { role: "user", content: text }],
      max_tokens: 24, temperature: 0, abortSignal: signal,
      response_format: { type: "json_schema", json_schema: { name: "intent", schema: CLASSIFY_SCHEMA } },
      ...noThink,
    } as any);
    return String(r.choices?.[0]?.message?.content ?? "");
  });
  // Warm-up on a fixed synthetic string (never user text): the first inference is ~4x slower and
  // would otherwise hit the 8 s classify timeout on her first message.
  await classifyRaw("สวัสดี").catch(() => "");
  onProgress(1);
  // Chat warm-up is background and chat-first only. Synthetic prompt; no network.
  runtime.startWarmup(async (s) => {
    await w.createChatCompletion({
      ...buildWllamaChatPrompt(chatSystemFor(CHAT_WARMUP_LANG), [], CHAT_WARMUP_USER),
      max_tokens: CHAT_WARMUP_MAX_TOKENS, temperature: 0, abortSignal: s,
    } as any);
  });
  return {
    name: `${label} (WASM)`,
    runtime: "wasm" as const,
    classifyRaw,
    ready: () => true,
    classify: async (text, signal) => parseIntent(await classifyRaw(text, signal)) as Intent[] | null,
    polishSummary: (draft, signal) => runtime.classifyOrPick(async () => {
      const line = needLine(draft);
      if (!line) return null;
      const r: any = await w.createChatCompletion({
        messages: [{ role: "system", content: POLISH_SYSTEM }, { role: "user", content: line }],
        max_tokens: 60, temperature: 0, abortSignal: signal,
        ...noThink,
      } as any);
      const out = cleanPolished(r.choices?.[0]?.message?.content ?? "");
      return out ? replaceNeedLine(draft, out) : null;
    }),
    pickCard: (text, shortlist, prev, signal) => runtime.classifyOrPick(async () => {
      const r: any = await w.createChatCompletion({
        messages: [{ role: "system", content: PICK_SYSTEM }, { role: "user", content: pickUser(text, shortlist, prev) }],
        max_tokens: PICK_MAX_TOKENS, temperature: 0, abortSignal: signal,
        response_format: { type: "json_schema", json_schema: { name: "pick", schema: pickSchema(shortlist.map((s) => s.id)) } },
        ...noThink,
      } as any);
      return String(r.choices?.[0]?.message?.content ?? "");
    }),
    // Defined for completeness; off on WASM by default (REWORD_RUNTIMES, p90 3.3 s on the studio Mac).
    rewordCard: (card, signal) => runtime.classifyOrPick(async () => {
      const r: any = await w.createChatCompletion({
        messages: [{ role: "system", content: REWORD_SYSTEM }, { role: "user", content: rewordUser(card) }],
        max_tokens: REWORD_MAX_TOKENS, temperature: 0, abortSignal: signal,
        ...noThink,
      } as any);
      return cleanReword(String(r.choices?.[0]?.message?.content ?? "")) || null;
    }),
    chatReply: (text, history, signal, lang, groupId, opts) => runtime.chat(groupId, signal, async (s) => {
      if (shouldSkipGeneration(groupId, s)) return null;
      const prompt = buildWllamaChatPrompt(chatSystemFor(lang ?? detectChatLang(text), opts), history, text);
      const r: any = await w.createChatCompletion({
        ...prompt,
        max_tokens: opts?.maxTokens ?? CHAT_MAX_TOKENS, temperature: CHAT_TEMPERATURE, top_p: CHAT_TOP_P, abortSignal: s,
      } as any);
      if (shouldSkipGeneration(groupId, s)) return null;
      // Raw model text: chatGuard / debug preview run in dialog. Do not strip here.
      return String(r.choices?.[0]?.message?.content ?? "") || null;
    }),
  };
}
