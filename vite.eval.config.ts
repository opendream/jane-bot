// Test-only build of eval.html (rules + model harness) for running the eval on another machine. Never shipped in the run bundle.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(base as any, defineConfig({
  define: { "import.meta.env.VITE_EVAL": JSON.stringify("1") },
  build: { outDir: "dist-eval", emptyOutDir: true, rollupOptions: { input: { eval: "eval.html" } } },
}));
