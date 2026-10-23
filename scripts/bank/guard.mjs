#!/usr/bin/env node
// Guard for committed answer-bank files (plan §2): no Dialogflow export structure, no PII patterns.
//   node scripts/bank/guard.mjs [dir ...]      (default: src/data/bank)   exit 1 on any finding
// Prints file, JSON path and category only, never the matched text.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPII } from "./pii-patterns.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

/** Keys that only appear in Dialogflow exports (intents, usersays, agent.json). */
export const DF_EXPORT_KEYS = ["usersays", "isTemplate", "responses", "messages", "userDefined", "webhookUsed", "affectedContexts", "rootParentId", "textToSpeech"];

export function publicHandles() {
  const s = JSON.parse(fs.readFileSync(path.join(root, "src/data/services.json"), "utf8"));
  return s.services.flatMap((x) => x.channels.filter((c) => c.type === "line" && String(c.value).startsWith("@")).map((c) => c.value));
}

/** Replace a key that itself looks like PII so it never appears in a reported path. */
export function pathSeg(k) {
  return Object.keys(findPII(String(k))).length ? "[redacted]" : String(k);
}

export function formatFinding(x) {
  return `${x.file} ${x.path} ${x.category}`;
}

export function jsonParseLocation(err, raw) {
  const msg = String(err?.message ?? "");
  const lc = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const posM = msg.match(/position\s+(\d+)/i);
  const index = posM ? Number(posM[1]) : 0;
  let line = 1, column = 1;
  const text = String(raw ?? "");
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") { line++; column = 1; } else column++;
  }
  return { line, column };
}

/** Parse-error message: file plus line/column only. Never source text. */
export function jsonParseError(file, err, raw) {
  const { line, column } = jsonParseLocation(err, raw);
  return new Error(`JSON parse error in ${file} at line ${line} column ${column}`);
}

function* walk(v, p = "$") {
  if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") yield [p, String(v)];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* walk(v[i], `${p}[${i}]`);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      const next = `${p}.${pathSeg(k)}`;
      yield [next, String(k)];
      yield* walk(x, next);
    }
  }
}

/** Scan one parsed JSON value. Source URLs in `url` fields are checked for FB links only (they cite public pages). */
export function scanValue(value, file = "(value)", allowHandles = publicHandles()) {
  const out = [];
  for (const [p, s] of walk(value)) {
    const key = p.split(".").pop();
    if (DF_EXPORT_KEYS.includes(s) && p.endsWith(`.${s}`)) { out.push({ file, path: p, category: "dialogflow_export_key" }); continue; }
    const hits = findPII(s, { allowHandles });
    for (const cat of Object.keys(hits)) {
      // Citation fields hold public URLs and publisher names: only FB links/CDN images and contact PII count there.
      if (/\.(url|by|title)$/.test(p) && !["facebook", "fb_cdn_image", "email", "phone", "national_id"].includes(cat)) continue;
      if (key === "$comment" && cat === "english_name") continue;
      out.push({ file, path: p, category: cat });
    }
  }
  return out;
}

export function scanFile(f, allowHandles) {
  const raw = fs.readFileSync(f, "utf8");
  const rel = path.relative(root, f);
  try {
    return scanValue(JSON.parse(raw), rel, allowHandles);
  } catch (e) {
    throw jsonParseError(rel, e, raw);
  }
}

export function scanDir(dir = path.join(root, "src/data/bank"), opts = {}) {
  const requireFiles = opts.requireFiles !== false;
  if (!fs.existsSync(dir)) {
    if (requireFiles) throw new Error(`bank dir missing: ${path.relative(root, dir) || dir}`);
    return [];
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (!files.length) {
    if (requireFiles) throw new Error(`bank dir empty: ${path.relative(root, dir) || dir}`);
    return [];
  }
  const handles = publicHandles();
  return files.flatMap((f) => scanFile(path.join(dir, f), handles));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dirs = process.argv.slice(2);
    const defaultDir = path.join(root, "src/data/bank");
    const found = (dirs.length ? dirs : [defaultDir]).flatMap((d) =>
      scanDir(path.resolve(d), { requireFiles: dirs.length > 0 }));
    for (const x of found) console.log(formatFinding(x));
    console.log(found.length ? `guard: ${found.length} finding(s)` : "guard: clean");
    process.exit(found.length ? 1 : 0);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "guard error");
    process.exit(1);
  }
}
