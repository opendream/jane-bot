// Test-only build of eval.html (rules + model harness) for running the eval on another machine. Never shipped in the run bundle.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
export default defineConfig((env) => mergeConfig(
  typeof base === "function" ? (base as (e: typeof env) => object)(env) : base,
  { build: { outDir: "dist-eval", emptyOutDir: true, rollupOptions: { input: { eval: "eval.html" } } } },
));
