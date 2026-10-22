import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

const ISOLATION = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

/** Dev only: serve ./models at /models/ from the same 127.0.0.1 origin (weights are never copied into dist). */
function localModels(): Plugin {
  const dir = path.resolve(__dirname, "models");
  const mw = (req: any, res: any, next: any) => {
    if (!req.url?.startsWith("/models/")) return next();
    const f = path.resolve(dir, decodeURIComponent(req.url.slice(8).split("?")[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Length", fs.statSync(f).size);
    res.setHeader("Content-Type", f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".json") ? "application/json" : "application/octet-stream");
    fs.createReadStream(f).pipe(res);
  };
  return { name: "local-models", configureServer: (s) => { s.middlewares.use(mw); }, configurePreviewServer: (s) => { s.middlewares.use(mw); } };
}

// Local only: bind to 127.0.0.1, no proxies, no external assets.
export default defineConfig({
  base: "./",
  plugins: [localModels()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true, headers: ISOLATION },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, headers: ISOLATION },
  worker: { format: "es" },
  build: { target: "es2022", assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 8000 },
  optimizeDeps: { exclude: ["@wllama/wllama"] },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
} as any);
