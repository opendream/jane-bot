import { CreateWebWorkerMLCEngine, type AppConfig } from "@mlc-ai/web-llm";
import type { LLMAdapter } from "./adapter";
import type { Intent } from "../core/types";
import type { WebGpuBuild } from "./models";
import { modelUrl } from "./weights-cache";
import { CLASSIFY_SYSTEM, POLISH_SYSTEM, PICK_SYSTEM, PICK_MAX_TOKENS, REWORD_SYSTEM, REWORD_MAX_TOKENS, cleanPolished, cleanReword, parseIntent, pickSchema, pickUser, rewordUser } from "./prompts";
import { needLine, replaceNeedLine } from "./summary-lines";

/** WebLLM on WebGPU, in a Web Worker. Weights and the WebGPU library come from our own origin only. */
export async function loadWebLLM(build: WebGpuBuild, label: string, onProgress: (p: number) => void): Promise<LLMAdapter & { classifyRaw(t: string): Promise<{ content: string; usage: any }>; polishRaw(t: string): Promise<{ content: string; usage: any }> }> {
  const appConfig: AppConfig = {
    cacheBackend: "cache" as any, // Cache Storage, model files only
    model_list: [{
      model: modelUrl(build.dir), model_id: build.modelId, model_lib: modelUrl(build.lib),
      overrides: { context_window_size: 2048 },
    } as any],
  };
  const worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
  const engine = await CreateWebWorkerMLCEngine(worker, build.modelId, {
    appConfig, initProgressCallback: (r) => onProgress(r.progress ?? 0),
  });
  onProgress(1);
  const askRaw = async (system: string, user: string, max: number, schema?: object) => {
    const r: any = await engine.chat.completions.create({
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: max, temperature: 0, extra_body: { enable_thinking: false },
      ...(schema ? { response_format: { type: "json_object", schema: JSON.stringify(schema) } } : {}),
    } as any);
    return { content: String(r.choices?.[0]?.message?.content ?? ""), usage: r.usage ?? null };
  };
  const ask = async (system: string, user: string, max: number, schema?: object) => (await askRaw(system, user, max, schema)).content;
  // Warm-up on a fixed synthetic string (never user text): first call compiles shaders.
  await ask(CLASSIFY_SYSTEM, "สวัสดี", 8).catch(() => "");
  return {
    name: `${label} (WebGPU)`,
    runtime: "webgpu" as const,
    /** Eval only: raw output + WebLLM usage stats (prefill/decode tokens per second). */
    classifyRaw: async (text: string) => askRaw(CLASSIFY_SYSTEM, text, 20),
    polishRaw: async (line: string) => askRaw(POLISH_SYSTEM, line, 60),
    ready: () => true,
    classify: async (text) => parseIntent(await ask(CLASSIFY_SYSTEM, text, 20)) as Intent[] | null,
    polishSummary: async (draft) => {
      const line = needLine(draft);
      if (!line) return null;
      const out = cleanPolished(await ask(POLISH_SYSTEM, line, 60));
      return out ? replaceNeedLine(draft, out) : null;
    },
    pickCard: async (text, shortlist, prev) => ask(PICK_SYSTEM, pickUser(text, shortlist, prev), PICK_MAX_TOKENS, pickSchema(shortlist.map((s) => s.id))),
    rewordCard: async (card) => cleanReword(await ask(REWORD_SYSTEM, rewordUser(card), REWORD_MAX_TOKENS)) || null,
  };
}
