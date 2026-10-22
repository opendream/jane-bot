import { defineConfig } from "vite";

// Local only: bind to 127.0.0.1, no proxies, no external assets.
export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { target: "es2022", assetsInlineLimit: 0, sourcemap: false },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
} as any);
