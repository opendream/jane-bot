// Single place for product-level settings. Change here, nowhere else.

/**
 * Product name (Keng's ruling, 30 Oct 2026 10:35 BKK): the Thai name is เจน.
 * UI art is the 2018 Sex Safe Safe illustrations in src/assets/jane/ (© Opendream 2018).
 * Never use the 2020 Jane artwork. The small mark in src/assets/mark.svg was drawn from scratch for this build.
 */
export const PRODUCT_NAME = "เจน";
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
 *  - "qwen3-0.6b-ft": WASM only, ~0.48 GB GGUF Q4_K_M. Default. Fine-tuned Jane weights, local
 *    (operator-placed at models/gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf; never fetched, no public URL).
 *    If that GGUF is not installed, startModel falls back to qwen3-1.7b when that model is
 *    installed; only if 1.7B is also missing does it go rules-only (warn + failed pill).
 *  - "qwen3-1.7b": WebGPU ~0.99 GB (q4f16_1 or q4f32_1), WASM ~1.11 GB (GGUF Q4_K_M). Select with ?model=qwen3-1.7b.
 *  - "qwen3-4b":   WebGPU only, ~2.29 GB; on machines without WebGPU the WASM path falls back to qwen3-1.7b.
 *  - "off":        rules only.
 * The rules always decide crisis handling; the model only refines need detection and summary wording.
 * Testing/filming override via URL: ?model=off | ?model=qwen3-1.7b | ?runtime=webgpu | ?runtime=wasm
 */
export const MODEL: "qwen3-0.6b-ft" | "qwen3-1.7b" | "qwen3-4b" | "off" = "qwen3-0.6b-ft";

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
 * Chat-first / model-first is the default: Jane talks, history is passed to the
 * local model, and a reviewed bank card is only a fallback (guard fail, timeout,
 * model not ready). Opt out with ?chatFirst=0 or CHAT_FIRST=false.
 */
export const CHAT_FIRST = true;
/** Prior user+Jane turns kept as model context (clipped to the context budget). */
export const CHAT_HISTORY_TURNS = 6;
/**
 * English model chat is off on this branch. Everyday English (including
 * open-ended disclosures the pin misses) takes the no-model card path with
 * the Thai-card note, same as #37. Crisis still runs first on every turn
 * (pinned detectCrisis on raw and on NFKC/folded text, then the add-only
 * chat-crisis check), whatever the letter-script class, on both chat-first
 * and card-first. Then the script/allowlist gate: leftover Latin share ≥ 60%
 * is English (no model call while this flag is false); no leftover Latin and
 * Thai share of what remains ≥ 60% calls Thai chat; mixed/unclear makes 0
 * model calls. Reply language still uses the word-list rule after the same
 * allowlist strip. Keep the English chatReply code path; tests that need the
 * flag on set `englishModelChat: true` on TurnDeps. English model chat is
 * planned as its own PR after filming.
 */
export const ENGLISH_MODEL_CHAT = false;
/**
 * Chat-first reply budget. Covers the whole model part of the turn, including
 * the retry (the clock does not restart). Card-first pick/reword timeouts are
 * unchanged (PICK_TIMEOUT_MS / REWORD_TIMEOUT_MS). Fine-tuned Qwen3-0.6B on
 * phone has been seen at 9–37 s on most turns and 90.6 s on one; 45 s is the
 * per-turn cap before the rules card shows on its own.
 */
export const CHAT_FIRST_TIMEOUT_MS = 45_000;
/** Chat-reply budget (plan §2). Same value as CHAT_FIRST_TIMEOUT_MS. */
export const CHAT_TIMEOUT_MS = CHAT_FIRST_TIMEOUT_MS;

/** Default on. Honour ?chatFirst=0 / false / off as an explicit card-first opt-out. */
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
 * Extra chat-crisis rules (src/core/chat-crisis.ts) after pinned detectCrisis.
 * On for both paths: chat-first and card-first. Add-only (never clears a pin).
 */
export const CHAT_CRISIS_CARD_FIRST = true;

/** True when the extra pre-model crisis check should run (always, with the card-first switch on). */
export function chatCrisisEnabled(chatFirst: boolean): boolean {
  return chatFirst || CHAT_CRISIS_CARD_FIRST;
}

/**
 * Chat reword (plan v2 §4): which runtimes may reword curated cards. The validator shows the exact text on any
 * failure. WASM is off: Qwen3-1.7B on WASM measured median 2.3 s, p90 3.3 s per short rewrite on the studio Mac
 * (22 Oct 2026, n=16), over the 3 s rule, so WASM shows cards verbatim. Card picking stays on for both.
 */
export const REWORD_RUNTIMES: readonly ("webgpu" | "wasm")[] = ["webgpu"];
