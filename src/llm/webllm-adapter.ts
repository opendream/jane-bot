import { CreateWebWorkerMLCEngine, type AppConfig } from "@mlc-ai/web-llm";
import type { LLMAdapter } from "./adapter";
import type { Intent } from "../core/types";
import type { WebGpuBuild } from "./models";
import { modelUrl } from "./weights-cache";
import { CLASSIFY_SYSTEM, POLISH_SYSTEM, PICK_SYSTEM, PICK_MAX_TOKENS, REWORD_SYSTEM, REWORD_MAX_TOKENS, cleanPolished, cleanReword, parseIntent, pickSchema, pickUser, rewordUser } from "./prompts";
import { CHAT_MAX_TOKENS, CHAT_TEMPERATURE, CHAT_TOP_P, chatSystemFor, cleanChat } from "./chat-system";
import { CHAT_WARMUP_LANG, CHAT_WARMUP_MAX_TOKENS, CHAT_WARMUP_USER } from "./chat-warmup";
import { createChatRuntime } from "./chat-engine";
import { detectChatLang } from "./chat-lang";
import { needLine, replaceNeedLine } from "./summary-lines";
import { isWebGpuRuntimeFailure } from "./gpu-failure";
import { WARMUP_BUDGET_MS } from "./loader-eta";
import { shouldSkipGeneration } from "./generation-token";

export { isWebGpuRuntimeFailure } from "./gpu-failure";

export interface WebLLMEngineLike {
  chat: { completions: { create: (req: unknown) => Promise<unknown> } };
  unload?: () => unknown;
  device?: { lost?: Promise<unknown> };
  gpuDevice?: { lost?: Promise<unknown> };
  /**
   * Best-effort cancel of in-flight GPU generate. WebLLM does not honour
   * AbortSignal on chat.completions.create; if interruptGenerate is missing
   * or ignored, the late result is discarded via the generation token and
   * must not be rendered or counted.
   */
  interruptGenerate?: () => void | Promise<void>;
}

export interface WebLLMWorkerLike {
  terminate: () => void;
  addEventListener?: (type: string, fn: (ev: unknown) => void) => void;
}

export interface BindWebLLMOpts {
  onDead?: (err: Error) => void;
  /** Final one-token warm-up is about to start. */
  onWarmup?: (budgetMs: number) => void;
  /** Chat-first only: run a background chat generate after the classify warm-up. */
  chatFirst?: boolean;
}

function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "WebGPU runtime failure");
  return new Error(msg);
}

/**
 * Bind a WebLLM engine: one-token warm-up (so a broken GPU fails at load, not on her first turn),
 * GPUDevice.lost / worker errors / disposed generate → not ready. Synthetic warm-up text only.
 */
export async function bindWebLLMEngine(
  engine: WebLLMEngineLike,
  worker: WebLLMWorkerLike,
  label: string,
  opts?: BindWebLLMOpts,
): Promise<LLMAdapter & { classifyRaw(t: string): Promise<{ content: string; usage: unknown }>; polishRaw(t: string): Promise<{ content: string; usage: unknown }>; dispose(): Promise<void> }> {
  let dead: Error | null = null;
  let released = false;

  const markDead = (err: unknown) => {
    if (dead) return;
    dead = asError(err);
    if (released) opts?.onDead?.(dead);
  };

  const device = engine.device ?? engine.gpuDevice;
  void device?.lost?.then((info) => markDead(info ?? new Error("GPUDeviceLostInfo")));
  worker.addEventListener?.("error", (ev) => {
    const e = ev && typeof ev === "object" ? (ev as { error?: unknown; message?: unknown }) : {};
    markDead(e.error ?? e.message ?? ev);
  });
  worker.addEventListener?.("messageerror", (ev) => markDead(ev));

  const dispose = async () => {
    try { await engine.unload?.(); } catch { /* teardown only */ }
    try { worker.terminate(); } catch { /* teardown only */ }
  };

  const askRaw = async (system: string, user: string, max: number, schema?: object) => {
    if (dead) throw dead;
    try {
      const r: any = await engine.chat.completions.create({
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: max, temperature: 0, extra_body: { enable_thinking: false },
        ...(schema ? { response_format: { type: "json_object", schema: JSON.stringify(schema) } } : {}),
      });
      if (dead) throw dead;
      return { content: String(r.choices?.[0]?.message?.content ?? ""), usage: r.usage ?? null };
    } catch (e) {
      if (isWebGpuRuntimeFailure(e) || dead) markDead(e);
      throw e;
    }
  };
  const ask = async (system: string, user: string, max: number, schema?: object) => (await askRaw(system, user, max, schema)).content;

  try {
    // One short token on a fixed synthetic string: first call compiles shaders; a lost device fails the load.
    await ask(CLASSIFY_SYSTEM, "สวัสดี", 1);
    if (dead) throw dead;
  } catch (e) {
    await dispose();
    throw e;
  }
  released = true;

  // Do not wait for a previous GPU generate: interrupt is best-effort and a
  // late result is discarded by the generation token. Chat warm-up is
  // chat-first only so card-first classify/pick never overlap it (#49).
  const runtime = createChatRuntime({ chatFirst: opts?.chatFirst, waitForPrevious: false });
  const withInterrupt = async <T>(s: AbortSignal, fn: () => Promise<T>): Promise<T> => {
    const stop = () => {
      try { void engine.interruptGenerate?.(); } catch { /* best-effort */ }
    };
    if (s.aborted) { stop(); throw new Error("aborted"); }
    s.addEventListener("abort", stop, { once: true });
    try {
      return await fn();
    } finally {
      s.removeEventListener("abort", stop);
    }
  };
  runtime.startWarmup(async (s) => {
    await withInterrupt(s, async () => {
      await engine.chat.completions.create({
        messages: [
          { role: "system", content: chatSystemFor(CHAT_WARMUP_LANG) },
          { role: "user", content: CHAT_WARMUP_USER },
        ],
        max_tokens: CHAT_WARMUP_MAX_TOKENS, temperature: 0,
        extra_body: { enable_thinking: false },
      });
    });
  });

  return {
    name: `${label} (WebGPU)`,
    runtime: "webgpu" as const,
    classifyRaw: (text: string) => runtime.classifyOrPick(() => askRaw(CLASSIFY_SYSTEM, text, 20)),
    polishRaw: (line: string) => runtime.classifyOrPick(() => askRaw(POLISH_SYSTEM, line, 60)),
    ready: () => !dead,
    classify: async (text) => parseIntent(await runtime.classifyOrPick(() => ask(CLASSIFY_SYSTEM, text, 20))) as Intent[] | null,
    polishSummary: async (draft) => runtime.classifyOrPick(async () => {
      const line = needLine(draft);
      if (!line) return null;
      const out = cleanPolished(await ask(POLISH_SYSTEM, line, 60));
      return out ? replaceNeedLine(draft, out) : null;
    }),
    pickCard: (text, shortlist, prev) => runtime.classifyOrPick(
      () => ask(PICK_SYSTEM, pickUser(text, shortlist, prev), PICK_MAX_TOKENS, pickSchema(shortlist.map((s) => s.id))),
    ),
    rewordCard: (card) => runtime.classifyOrPick(
      async () => cleanReword(await ask(REWORD_SYSTEM, rewordUser(card), REWORD_MAX_TOKENS)) || null,
    ),
    chatReply: (text, history, signal, lang, groupId, opts) => runtime.chat(groupId, signal, async (s) => {
      if (shouldSkipGeneration(groupId, s)) return null;
      if (dead) throw dead;
      try {
        const r: any = await withInterrupt(s, () => engine.chat.completions.create({
          messages: [
            { role: "system", content: chatSystemFor(lang ?? detectChatLang(text), opts) },
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: "user", content: text },
          ],
          max_tokens: opts?.maxTokens ?? CHAT_MAX_TOKENS, temperature: CHAT_TEMPERATURE, top_p: CHAT_TOP_P,
          extra_body: { enable_thinking: false },
        }));
        if (dead) throw dead;
        if (shouldSkipGeneration(groupId, s)) return null;
        return cleanChat(String(r.choices?.[0]?.message?.content ?? ""), lang ?? detectChatLang(text)) || null;
      } catch (e) {
        if (isWebGpuRuntimeFailure(e) || dead) markDead(e);
        throw e;
      }
    }),
    dispose,
  };
}

/** WebLLM on WebGPU, in a Web Worker. Weights and the WebGPU library come from our own origin only. */
export async function loadWebLLM(
  build: WebGpuBuild,
  label: string,
  onProgress: (p: number) => void,
  opts?: BindWebLLMOpts,
): Promise<LLMAdapter & { classifyRaw(t: string): Promise<{ content: string; usage: unknown }>; polishRaw(t: string): Promise<{ content: string; usage: unknown }>; dispose(): Promise<void> }> {
  const appConfig: AppConfig = {
    cacheBackend: "cache" as any, // Cache Storage, model files only
    model_list: [{
      model: modelUrl(build.dir), model_id: build.modelId, model_lib: modelUrl(build.lib),
      overrides: { context_window_size: 2048 },
    } as any],
  };
  const worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
  try {
    const engine = await CreateWebWorkerMLCEngine(worker, build.modelId, {
      appConfig, initProgressCallback: (r) => onProgress(r.progress ?? 0),
    });
    opts?.onWarmup?.(WARMUP_BUDGET_MS);
    onProgress(1);
    return await bindWebLLMEngine(engine as WebLLMEngineLike, worker, label, opts);
  } catch (e) {
    try { worker.terminate(); } catch { /* teardown */ }
    throw e;
  }
}
