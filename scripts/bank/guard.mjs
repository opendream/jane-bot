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

/** Reviewer-only quiz fields. User-facing prompt_th / options / explanation_th stay scanned. */
const QUIZ_REVIEWER_EN_FIELDS = new Set([
  "prompt_en", "explanation_en", "correct_answer_text", "fact_check", "suggested_audience", "source",
]);
/** Review-pack parentheticals that sit on otherwise-Thai option buttons (Fact/Myth/Send/Don't). */
const QUIZ_OPTION_EN_TOKENS = new Set(["fact", "myth", "send", "don"]);
/** English metadata that is not user-facing Thai copy (reviewer names, DF intent ids, pack decisions). */
const METADATA_EN_FIELDS = new Set([
  "$comment", "notes", "licence", "reviewer", "decision", "audience_set_by_keng", "source_intents", "status", "topic_file",
]);

function cardFlagsAt(root, p) {
  const m = String(p).match(/^\$\.cards\[(\d+)\]/);
  if (!m || !root || !Array.isArray(root.cards)) return [];
  const flags = root.cards[Number(m[1])]?.flags;
  return Array.isArray(flags) ? flags : [];
}

export function jsonField(p) {
  return String(p).replace(/\[\d+\]/g, "").split(".").filter((s) => s && s !== "$").pop() ?? "";
}

/** Scan one parsed JSON value. Source URLs in `url` fields are checked for FB links only (they cite public pages). */
export function scanValue(value, file = "(value)", allowHandles = publicHandles()) {
  const out = [];
  const quizFile = String(file).endsWith("quiz.json");
  for (const [p, s] of walk(value)) {
    const field = jsonField(p);
    if (DF_EXPORT_KEYS.includes(s) && p.endsWith(`.${s}`)) { out.push({ file, path: p, category: "dialogflow_export_key" }); continue; }
    const hits = findPII(s, { allowHandles });
    for (const cat of Object.keys(hits)) {
      // Citation URLs: path digits (an NHSO article slug) are not phones. A raw phone planted as the
      // url value still fails. Publisher names on by/title are not english_name hits.
      if (field === "url" && /^https?:\/\//i.test(s) && cat === "phone") continue;
      if ((field === "by" || field === "title") && !["facebook", "fb_cdn_image", "email", "national_id", "phone"].includes(cat)) continue;
      // English metadata is not user-facing Thai text: capitalised words there are not names.
      if (METADATA_EN_FIELDS.has(field) && cat === "english_name") continue;
      if (quizFile && QUIZ_REVIEWER_EN_FIELDS.has(field) && cat === "english_name") continue;
      // Keng-approved pii_checked cards: name-detector false positives stay; contact PII still fails.
      if (cardFlagsAt(value, p).includes("pii_checked") && (cat === "thai_name" || cat === "english_name")) continue;
      // "legal line about …" in a fact-check note is not a Line id.
      if (quizFile && field === "fact_check" && cat === "line_id") continue;
      if (quizFile && field === "options" && cat === "english_name") {
        const leftover = (hits.english_name ?? []).filter((w) => !QUIZ_OPTION_EN_TOKENS.has(String(w).toLowerCase()));
        if (!leftover.length) continue;
      }
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

/** Shipped LICENSE/NOTICE filenames (plain text, not JSON). */
export const NOTICE_NAMES = new Set(["LICENSE", "NOTICE"]);
/** Phone/email only: CC legal code would false-positive on english_name. Reuses findPII from pii-patterns.mjs. */
const NOTICE_CONTACT = new Set(["phone", "email"]);

/** Scan one LICENSE/NOTICE file as text. Reports phone/email categories only; never the matched value. */
export function scanPlainText(f, allowHandles = publicHandles()) {
  const raw = fs.readFileSync(f, "utf8");
  const rel = path.relative(root, f);
  const hits = findPII(raw, { allowHandles });
  return Object.keys(hits).filter((cat) => NOTICE_CONTACT.has(cat)).map((cat) => ({ file: rel, path: "$", category: cat }));
}

export function scanNoticeFiles(dir, allowHandles = publicHandles()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => NOTICE_NAMES.has(f)).flatMap((f) => scanPlainText(path.join(dir, f), allowHandles));
}

export function scanDir(dir = path.join(root, "src/data/bank"), opts = {}) {
  const requireFiles = opts.requireFiles !== false;
  if (!fs.existsSync(dir)) {
    if (requireFiles) throw new Error(`bank dir missing: ${path.relative(root, dir) || dir}`);
    return [];
  }
  const names = fs.readdirSync(dir);
  const files = names.filter((f) => f.endsWith(".json"));
  const notices = names.filter((f) => NOTICE_NAMES.has(f));
  if (!files.length) {
    if (requireFiles) throw new Error(`bank dir empty: ${path.relative(root, dir) || dir}`);
    return notices.flatMap((f) => scanPlainText(path.join(dir, f)));
  }
  const handles = publicHandles();
  return [
    ...files.flatMap((f) => scanFile(path.join(dir, f), handles)),
    ...notices.flatMap((f) => scanPlainText(path.join(dir, f), handles)),
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dirs = process.argv.slice(2);
    const defaultDir = path.join(root, "src/data/bank");
    const evalsDir = path.join(root, "evals");
    const found = dirs.length
      ? dirs.flatMap((d) => scanDir(path.resolve(d), { requireFiles: true }))
      : [...scanDir(defaultDir, { requireFiles: false }), ...scanNoticeFiles(evalsDir)];
    for (const x of found) console.log(formatFinding(x));
    console.log(found.length ? `guard: ${found.length} finding(s)` : "guard: clean");
    process.exit(found.length ? 1 : 0);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "guard error");
    process.exit(1);
  }
}
