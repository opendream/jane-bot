// Single place for product-level settings. Change here, nowhere else.

/**
 * Product name (Keng's ruling, 22 Oct 2026 19:49 BKK): keep the Jane / พี่เจน name.
 * UI art is the 2018 Sex Safe Safe illustrations in src/assets/jane/ (© Opendream 2018).
 * Never use the 2020 Jane artwork. The small mark in src/assets/mark.svg was drawn from scratch for this build.
 */
export const PRODUCT_NAME = "พี่เจน";
export const PRODUCT_NAME_EN = "Jane";

/** Lowest age for the demo. Open question for Keng; default 15+. */
export const MIN_AGE = 15;

/** Thai copy and the crisis phrase list: Keng's 27 Oct 2026 review pack. Crisis lists were all Approve (unchanged). */
export const THAI_COPY_STATUS: "draft" | "reviewed" = "reviewed";

/** Time zone for every "open now" check. */
export const SERVICE_TZ = "Asia/Bangkok";

/** Max services suggested per need. */
export const MAX_SUGGESTIONS = 3;

/**
 * On-device model (Qwen3, plain Apache-2.0). Typhoon is on hold pending Keng's ruling on the OpenTyphoon terms.
 *  - "qwen3-1.7b": WebGPU ~0.99 GB (q4f16_1 or q4f32_1), WASM ~1.11 GB (GGUF Q4_K_M). Default.
 *  - "qwen3-4b":   WebGPU only, ~2.29 GB; on machines without WebGPU the WASM path falls back to qwen3-1.7b.
 *  - "off":        rules only.
 * The rules always decide crisis handling; the model only refines need detection and summary wording.
 * Testing/filming override via URL: ?model=off | ?runtime=webgpu | ?runtime=wasm
 */
export const MODEL: "qwen3-1.7b" | "qwen3-4b" | "off" = "qwen3-1.7b";

/**
 * Fine-tuned embedding intent matcher (e5-small int8). Off by default and never on
 * phones: iteration 3 failed gate 2 (in-scope abstain 32–45% vs ≤20%) and leaked 1–3
 * normal cards on the development harassment/crisis sets (gate 1). The shipped router
 * is rules (crisis first, then trigger retrieval, then the fallback card).
 * Desktop-dev only (`import.meta.env.DEV`): set MATCHER true here, or ?matcher=1.
 * Production builds never enable it. Weights, if any, load from a
 * local gitignored dir (`models/matcher/` or ?matcherWeights=models/...). Not committed.
 */
export const MATCHER = false;

/**
 * Model-first card pick (PR 2 engine + PR 3 UI). Off by default. When off, chat
 * behaviour is unchanged (rules-first; model only if the rules are unsure).
 * Crisis, guard, chip and locked routes never call the model.
 * Testing/filming override: ?modelPick=1 (same pattern as ?model=).
 */
export const MODEL_CARD_PICK = false;

export function modelCardPickEnabled(search?: string): boolean {
  try {
    const raw = search ?? (typeof location !== "undefined" ? location.search : "");
    const v = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw).get("modelPick")?.toLowerCase() ?? "";
    if (v === "1" || v === "on" || v === "true") return true;
    if (v === "0" || v === "off" || v === "false") return false;
  } catch { /* node unit tests */ }
  return MODEL_CARD_PICK;
}

/**
 * Start the on-device model only when the pick flag is on, or when an existing
 * filming/dev URL override asks for a real runtime. Flag-off default: no download.
 */
export function shouldPreloadModel(search?: string): boolean {
  if (modelCardPickEnabled(search)) return true;
  try {
    const raw = search ?? (typeof location !== "undefined" ? location.search : "");
    const p = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
    if (p.get("testRuntime")) return true;
    const runtime = (p.get("runtime") ?? "").toLowerCase();
    if (runtime === "wasm" || runtime === "webgpu") return true;
    const model = (p.get("model") ?? "").toLowerCase();
    if (model && model !== "off") return true;
  } catch { /* node unit tests */ }
  return false;
}

export function pickTimeoutMsFromSearch(search?: string, fallback = 20_000): number {
  try {
    const raw = search ?? (typeof location !== "undefined" ? location.search : "");
    const v = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw).get("pickTimeoutMs");
    const n = v ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch { /* node unit tests */ }
  return fallback;
}

/**
 * Chat reword (plan v2 §4): which runtimes may reword curated cards. The validator shows the exact text on any
 * failure. WASM is off: Qwen3-1.7B on WASM measured median 2.3 s, p90 3.3 s per short rewrite on the studio Mac
 * (22 Oct 2026, n=16), over the 3 s rule, so WASM shows cards verbatim. Card picking stays on for both.
 */
export const REWORD_RUNTIMES: readonly ("webgpu" | "wasm")[] = ["webgpu"];
