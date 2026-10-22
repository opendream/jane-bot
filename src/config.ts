// Single place for product-level settings. Change here, nowhere else.

/** Neutral placeholder name. Not "Jane" / "พี่เจน" (ThaiHealth IP question open). */
export const PRODUCT_NAME = "ผู้ช่วยเดโม";
export const PRODUCT_NAME_EN = "Demo Helper";

/** Lowest age for the demo. Open question for Keng; default 15+. */
export const MIN_AGE = 15;

/** All Thai copy and the crisis phrase list are DRAFT until a Thai SRH/safety reviewer signs off. */
export const THAI_COPY_STATUS: "draft" | "reviewed" = "draft";

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
