#!/usr/bin/env node
/**
 * Elsa-side writer for models/devtest/arms.json. Reads a directory of GGUFs (or
 * llama-gguf-split shards) OUTSIDE the repo, hashes them, and writes the manifest
 * the phone fetches. Hard-codes no model family names.
 *
 *   node scripts/devtest/make-arms.mjs [--dir ~/jane-devtest/models/devtest]
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_BLOB_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ARM_BYTES = 4 * 1024 * 1024 * 1024;
export const ARM_ID_RE = /^[A-F]-(base|tuned)$/;

export function parseShardName(name) {
  const shard = /^(.+)-(\d{5})-of-(\d{5})\.gguf$/i.exec(name);
  if (shard) return { stem: shard[1], index: Number(shard[2]), total: Number(shard[3]), shard: true };
  const single = /^(.+)\.gguf$/i.exec(name);
  if (single) return { stem: single[1], index: 1, total: 1, shard: false };
  return null;
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export function combinedSha(fileShas) {
  return createHash("sha256").update(fileShas.join("")).digest("hex");
}

export function comparisonNote(id) {
  const letter = id.slice(0, 1);
  if (letter === "C" || letter === "D") {
    return "comparison only — not distributed; owner must clear the licence before anything ships";
  }
  return undefined;
}

export function readSums(dir) {
  const p = path.join(dir, "SHA256SUMS");
  if (!fs.existsSync(p)) return null;
  const map = new Map();
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m) map.set(path.basename(m[2]), m[1].toLowerCase());
  }
  return map;
}

export function assessSizes(blobBytes, total) {
  if (blobBytes.some((b) => b > MAX_BLOB_BYTES)) {
    return { phone_ready: false, not_ready_reason: "needs split (a blob is over 2 GiB)" };
  }
  if (total > MAX_ARM_BYTES) {
    return { phone_ready: false, not_ready_reason: "over 4 GiB, not phone-ready" };
  }
  return { phone_ready: true };
}

export async function scanDir(dir) {
  const abs = path.resolve(dir);
  const names = fs.existsSync(abs) ? fs.readdirSync(abs).filter((n) => n.toLowerCase().endsWith(".gguf")) : [];
  const groups = new Map();
  for (const name of names) {
    const info = parseShardName(name);
    if (!info || !ARM_ID_RE.test(info.stem)) continue;
    const g = groups.get(info.stem) ?? { stem: info.stem, files: [] };
    g.files.push({ name, ...info, path: path.join(abs, name) });
    groups.set(info.stem, g);
  }
  const sums = readSums(abs);
  const arms = [];
  for (const g of [...groups.values()].sort((a, b) => a.stem.localeCompare(b.stem))) {
    const files = g.files.slice().sort((a, b) => a.index - b.index);
    const blob_bytes = files.map((f) => fs.statSync(f.path).size);
    const bytes = blob_bytes.reduce((a, b) => a + b, 0);
    const fileShas = [];
    let shaMismatch = false;
    for (const f of files) {
      const sha = await sha256File(f.path);
      fileShas.push(sha);
      if (sums && sums.get(f.name) && sums.get(f.name) !== sha) shaMismatch = true;
    }
    const sha256 = files.length === 1 ? fileShas[0] : combinedSha(fileShas);
    const size = assessSizes(blob_bytes, bytes);
    const note = comparisonNote(g.stem);
    const rel = files.map((f) => `devtest/${f.name}`);
    const phone_ready = size.phone_ready && !shaMismatch;
    arms.push({
      id: g.stem,
      label: g.stem,
      files: rel,
      bytes,
      sha256,
      blob_bytes,
      phone_ready,
      ...(note ? { note } : {}),
      ...(!phone_ready ? { not_ready_reason: shaMismatch ? "sha256 mismatch" : size.not_ready_reason } : {}),
    });
  }
  return arms;
}

export async function writeManifest(dir, outFile) {
  const arms = await scanDir(dir);
  const json = { generated: new Date().toISOString(), arms };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(json, null, 2) + "\n");
  return json;
}

function arg(k, d) {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const dir = path.resolve(arg("--dir", path.join(os.homedir(), "jane-devtest/models/devtest")));
  const out = path.resolve(arg("--out", path.join(dir, "arms.json")));
  const json = await writeManifest(dir, out);
  console.log(`wrote ${out} (${json.arms.length} arms) from ${dir}`);
}
