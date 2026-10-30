#!/usr/bin/env node
// Downloads model weights ONCE from their original open sources (pinned revisions in weights-manifest.json),
// verifies every file by sha256, and writes models/installed.json for the app. Node 18+ only, no dependencies.
//
//   node scripts/fetch-weights.mjs                      # qwen3-1.7b: WebGPU f16 + WASM  (~2.1 GB)
//   node scripts/fetch-weights.mjs --model qwen3-4b     # qwen3-4b WebGPU f16 (~2.3 GB) + 1.7B WASM fallback
//   node scripts/fetch-weights.mjs --variants webgpu_f16,webgpu_f32,wasm
//   node scripts/fetch-weights.mjs --verify-only
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const manifest = JSON.parse(fs.readFileSync(path.join(here, "weights-manifest.json"), "utf8"));
const MODELS_DIR = path.resolve(arg("--models", path.join(here, "..", "models")));
const model = arg("--model", "qwen3-1.7b");
if (!manifest.models[model]) { console.error(`unknown model ${model}; choose: ${Object.keys(manifest.models).join(", ")}`); process.exit(2); }
const defaultVariants = (entry) => {
  const vs = [];
  if (entry.webgpu_f16) vs.push("webgpu_f16");
  else if (entry.webgpu_f32) vs.push("webgpu_f32");
  if (entry.wasm) vs.push("wasm");
  return vs.join(",") || "webgpu_f16";
};
const variants = (arg("--variants", "") || defaultVariants(manifest.models[model])).split(",");

/** WASM fallback for models without a WASM build (qwen3-4b → qwen3-1.7b). */
const jobs = variants.map((v) => [model, v]);
if (!manifest.models[model].wasm && !arg("--variants")) jobs.push(["qwen3-1.7b", "wasm"]);

const sha256File = (f) => new Promise((ok, bad) => {
  const h = crypto.createHash("sha256");
  fs.createReadStream(f).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", bad);
});
const gb = (n) => (n / 1e9).toFixed(2) + " GB";

async function getFile(f) {
  const dest = path.join(MODELS_DIR, f.path);
  if (fs.existsSync(dest) && fs.statSync(dest).size === f.size && (await sha256File(dest)) === f.sha256) return "ok";
  // Local-only entries have no URL: never fetch, only verify if the operator placed the file.
  if (!f.url) return "missing";
  if (flag("--verify-only")) return "missing";
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".part";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(f.url, { redirect: "follow" });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
      const got = await sha256File(tmp);
      if (got !== f.sha256) throw new Error(`checksum mismatch (got ${got.slice(0, 12)}…)`);
      fs.renameSync(tmp, dest);
      return "downloaded";
    } catch (e) {
      if (attempt === 3) { fs.rmSync(tmp, { force: true }); throw new Error(`${f.path}: ${e.message}`); }
    }
  }
}

const installedPath = path.join(MODELS_DIR, "installed.json");
const installed = fs.existsSync(installedPath) ? JSON.parse(fs.readFileSync(installedPath, "utf8")).installed : [];
let failed = false;
for (const [m, v] of jobs) {
  const entry = manifest.models[m][v];
  if (!entry) { console.error(`no ${v} build for ${m}`); failed = true; continue; }
  console.log(`\n${m} / ${v}: ${entry.files.length} files, ${gb(entry.total_bytes)} from ${entry.source}`);
  let done = 0, ok = true;
  for (const f of entry.files) {
    try {
      const st = await getFile(f);
      if (st === "missing") ok = false;
      done += f.size;
      process.stdout.write(`\r  ${Math.round((100 * done) / entry.total_bytes)}%  ${st.padEnd(10)} ${path.basename(f.path).slice(0, 40).padEnd(40)}`);
    } catch (e) { ok = false; failed = true; console.error(`\n  FAILED ${e.message}`); }
  }
  console.log(ok ? `\n  verified (sha256)` : `\n  INCOMPLETE`);
  let rec = installed.find((i) => i.model === m);
  if (!rec) installed.push((rec = { model: m, variants: [] }));
  rec.variants = rec.variants.filter((x) => x !== v);
  if (ok) rec.variants.push(v);
}
fs.mkdirSync(MODELS_DIR, { recursive: true });
fs.writeFileSync(installedPath, JSON.stringify({ updated: new Date().toISOString(), installed }, null, 2) + "\n");
console.log(`\nwrote ${installedPath}`);
process.exit(failed ? 1 : 0);
