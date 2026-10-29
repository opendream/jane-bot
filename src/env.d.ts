/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "1" in the eval build so the in-memory chat-crisis tag is kept. Never user text. */
  readonly VITE_EVAL?: string;
}

interface Window {
  /** E2E / unit test hook only. Never stores user content. */
  __JANE_RUNTIME_TEST__?: {
    webllm?: "warmup-lost" | "generate-lost" | "disposed";
    wasm?: "ok" | "unavailable";
    gpu?: boolean;
    pick?: "ok" | "timeout" | "not-ready" | "warmup" | "warmup-slow";
  };
  /** TestRuntime mock call counts. Never stores user content. */
  __JANE_MODEL_CALLS__?: { chat: number; pick: number; reword: number };
}
declare module "*.css";
declare module "*.webp" {
  const src: string;
  export default src;
}
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.svg?raw" {
  const src: string;
  export default src;
}
declare module "*.woff2" {
  const src: string;
  export default src;
}
