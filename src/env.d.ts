/// <reference types="vite/client" />

/** True only in `vite build --mode devtest`. Production builds replace this with false. */
declare const __JANE_DEVTEST__: boolean;

interface Window {
  /** E2E / unit test hook only. Never stores user content. */
  __JANE_RUNTIME_TEST__?: {
    webllm?: "warmup-lost" | "generate-lost" | "disposed";
    wasm?: "ok" | "unavailable";
    gpu?: boolean;
    pick?: "ok" | "timeout" | "not-ready" | "warmup" | "warmup-slow";
  };
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
