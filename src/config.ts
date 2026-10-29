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
 * Start the on-device model unless it is explicitly off. Independent of MODEL_CARD_PICK:
 * flag-off chat uses the same trigger as v2/answer-bank-chat (call start after first
 * paint; startModel then loads if weights are installed). Only model-card-pick UI is
 * flag-gated, not this load. `?model=off` still skips the fetch and worker.
 */
export function shouldPreloadModel(search?: string): boolean {
  try {
    const raw = search ?? (typeof location !== "undefined" ? location.search : "");
    const p = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
    const model = (p.get("model") ?? MODEL).toLowerCase();
    if (model === "off") return false;
  } catch { /* node unit tests */ }
  return MODEL !== "off";
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
 * Chat-first (PR A): Jane talks, then hands over a reviewed bank card at the end of the topic.
 * Off by default so production stays card-first until Keng flips this.
 * Filming/demo override: ?chatFirst=1 works on the production build as well as
 * the Vite dev server (same pattern as ?modelPick=). Flag-off stays card-first.
 */
export const CHAT_FIRST = false;
/**
 * English model chat is off in this PR. While false, a chat-first turn that
 * is not clearly Thai never calls the model: letter script (Latin share
 * ≥ 60%, mixed Thai/English, <2 letters, or no letters) takes the fixed-card
 * path (rules match, bank English body when present on an English-language
 * turn, otherwise the Thai card plus the DRAFT "This info card is in Thai."
 * note on English-language turns). Reply language still uses the word-list
 * rule. English strings, language detection, and the English output-guard
 * path stay in place so a later crisis-detection PR can flip this.
 */
export const ENGLISH_MODEL_CHAT = false;
/** User turns in one topic before Jane must close with a card. */
export const CHAT_MAX_TURNS = 3;
/** Chat-reply budget (plan §2). Pick still uses PICK_TIMEOUT_MS (8 s). */
export const CHAT_TIMEOUT_MS = 12_000;

/** Honours ?chatFirst=1 on production builds too (not a Vite-dev-only flag). */
export function chatFirstEnabled(search?: string): boolean {
  try {
    const raw = search ?? (typeof location !== "undefined" ? location.search : "");
    const v = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw).get("chatFirst")?.toLowerCase() ?? "";
    if (v === "1" || v === "on" || v === "true") return true;
    if (v === "0" || v === "off" || v === "false") return false;
  } catch { /* node unit tests */ }
  return CHAT_FIRST;
}

/**
 * Chat reword (plan v2 §4): which runtimes may reword curated cards. The validator shows the exact text on any
 * failure. WASM is off: Qwen3-1.7B on WASM measured median 2.3 s, p90 3.3 s per short rewrite on the studio Mac
 * (22 Oct 2026, n=16), over the 3 s rule, so WASM shows cards verbatim. Card picking stays on for both.
 */
export const REWORD_RUNTIMES: readonly ("webgpu" | "wasm")[] = ["webgpu"];
