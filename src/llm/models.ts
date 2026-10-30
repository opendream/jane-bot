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

export const MODELS: Record<ModelSpec["key"], ModelSpec> = {
  "qwen3-0.6b-ft": {
    key: "qwen3-0.6b-ft", label: "Qwen3-0.6B (Jane fine-tuned)",
    wasm: { file: "gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf", bytes: 484220256 },
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
