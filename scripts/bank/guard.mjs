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

function* walk(v, p = "$") {
  if (typeof v === "string") yield [p, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* walk(v[i], `${p}[${i}]`);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { yield [`${p}.${k}`, k]; yield* walk(x, `${p}.${k}`); }
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
  return scanValue(JSON.parse(raw), path.relative(root, f), allowHandles);
}

export function scanDir(dir = path.join(root, "src/data/bank")) {
  if (!fs.existsSync(dir)) return [];
  const handles = publicHandles();
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => scanFile(path.join(dir, f), handles));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  const found = (dirs.length ? dirs : [path.join(root, "src/data/bank")]).flatMap((d) => scanDir(path.resolve(d)));
  for (const x of found) console.log(`${x.file} ${x.path} ${x.category}`);
  console.log(found.length ? `guard: ${found.length} finding(s)` : "guard: clean");
  process.exit(found.length ? 1 : 0);
}
