/** Local paths (under /models/ on the app's own origin) for each model build. Must match scripts/weights-manifest.json. */
export interface WebGpuBuild { modelId: string; dir: string; lib: string; bytes: number }
export interface WasmBuild { file: string; bytes: number }
export interface ModelSpec {
  key: "qwen3-0.6b-ft" | "qwen3-1.7b" | "qwen3-4b";
  label: string;
  /** Optional: the fine-tuned 0.6B has no MLC/WebGPU build and runs WASM-only. */
  webgpu_f16?: WebGpuBuild;
  webgpu_f32?: WebGpuBuild;
  wasm?: WasmBuild;
  /** If no WASM build, use this model on the WASM path. */
  wasmFallback?: "qwen3-1.7b";
}

const mlc = (id: string, bytes: number): WebGpuBuild => ({
  modelId: id, dir: `webllm/${id}`, lib: `webllm/libs/${id.replace(/-MLC$/, "")}_cs1k-webgpu.wasm`, bytes,
});

/** Local-only Jane fine-tune. Operator-placed under models/; never fetched, never committed. */
export const FT_GGUF_FILE = "gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf";
export const FT_GGUF_BYTES = 484220256;
export const FT_GGUF_SHA256 = "1a8056e4f1d0afba32ab87c24f8c2740258b130a9bb7bb5311e742c921daf8e2";

export const MODELS: Record<ModelSpec["key"], ModelSpec> = {
  "qwen3-0.6b-ft": {
    key: "qwen3-0.6b-ft", label: "Qwen3-0.6B (Jane fine-tuned)",
    wasm: { file: FT_GGUF_FILE, bytes: FT_GGUF_BYTES },
  },
  "qwen3-1.7b": {
    key: "qwen3-1.7b", label: "Qwen3-1.7B",
    webgpu_f16: mlc("Qwen3-1.7B-q4f16_1-MLC", 0.99e9),
    webgpu_f32: mlc("Qwen3-1.7B-q4f32_1-MLC", 0.99e9),
    wasm: { file: "gguf/Qwen3-1.7B-Q4_K_M.gguf", bytes: 1.11e9 },
  },
  "qwen3-4b": {
    key: "qwen3-4b", label: "Qwen3-4B",
    webgpu_f16: mlc("Qwen3-4B-q4f16_1-MLC", 2.29e9),
    webgpu_f32: mlc("Qwen3-4B-q4f32_1-MLC", 2.29e9),
    wasmFallback: "qwen3-1.7b",
  },
};
