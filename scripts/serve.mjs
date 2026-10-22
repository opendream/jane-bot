#!/usr/bin/env node
// Static server for the demo. Node only, no dependencies.
//  - Binds to 127.0.0.1 only. Serves ./dist at / and ./models at /models/.
//  - COOP/COEP headers (needed for multi-threaded WASM). Range requests for large weight files.
//  - Logs nothing about requests (chat text never reaches the server anyway).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(arg("--root", path.join(here, "..")));
const port = Number(arg("--port", process.env.PORT || 4173));
const DIST = path.resolve(arg("--dist", path.join(root, "dist")));
const MODELS = path.resolve(arg("--models", path.join(root, "models")));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };

function resolveFile(urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  const [base, rel] = p.startsWith("/models/") ? [MODELS, p.slice("/models/".length)] : [DIST, p === "/" ? "index.html" : p.slice(1)];
  const f = path.resolve(base, rel);
  if (!f.startsWith(base + path.sep) && f !== base) return null;
  try { return fs.statSync(f).isFile() ? f : null; } catch { return null; }
}

const server = http.createServer((req, res) => {
  const f = resolveFile(req.url || "/");
  const headers = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-cache" };
  if (!f) { res.writeHead(404, headers); return res.end(); }
  const size = fs.statSync(f).size;
  Object.assign(headers, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Accept-Ranges": "bytes" });
  const m = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  if (m) {
    const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return req.method === "HEAD" ? res.end() : fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  return req.method === "HEAD" ? res.end() : fs.createReadStream(f).pipe(res);
});
server.listen(port, "127.0.0.1", () => {
  if (!fs.existsSync(path.join(DIST, "index.html"))) console.error("dist/index.html not found: run the build first");
  console.log(`Demo running at http://127.0.0.1:${port}/  (local only; Ctrl+C to stop)`);
});
