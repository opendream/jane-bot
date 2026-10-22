// Minimal static server for the spike: 127.0.0.1 only, COOP/COEP for WASM threads, no request logging.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.dirname(new URL(import.meta.url).pathname);
const port = Number(process.argv[2] || 8098);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json" };
http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size;
  const headers = { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp", "Accept-Ranges": "bytes" };
  const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = Number(range[1]), end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  fs.createReadStream(f).pipe(res);
}).listen(port, "127.0.0.1");
