#!/usr/bin/env node
// Plan §1: no raw-export phrase may appear in card triggers. Local only (reads the off-repo exports).
//   node scripts/bank/check-triggers.mjs --bot DIR --jane DIR
// Prints counts and card ids only, never phrase text. Exit 1 if any trigger equals an export phrase.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readExport, mergeExports, normPhrase } from "./df-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bankDir = path.resolve(here, "../../src/data/bank");

function triggerParts(t) {
  if (typeof t === "string") return [t];
  if (t && typeof t === "object" && Array.isArray(t.all)) return t.all.filter((x) => typeof x === "string");
  return [];
}

export function triggerOverlap(cards, phraseKeys) {
  const hits = [];
  for (const c of cards) for (const t of c.triggers ?? []) {
    for (const part of triggerParts(t)) if (phraseKeys.has(normPhrase(part))) hits.push(c.id);
  }
  return hits;
}

export function bankCards(dir = bankDir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "quiz.json").flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).cards ?? []);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const { merged } = mergeExports(readExport(arg("--bot"), "bot"), readExport(arg("--jane"), "jane"));
  const keys = new Set(merged.flatMap((r) => r.phrases.map(normPhrase)));
  const cards = bankCards();
  const hits = triggerOverlap(cards, keys);
  const triggers = cards.reduce((a, c) => a + (c.triggers?.length ?? 0), 0);
  console.log(JSON.stringify({ cards: cards.length, triggers, exportPhrases: keys.size, triggersEqualToExportPhrase: hits.length, cardIds: [...new Set(hits)] }));
  process.exit(hits.length ? 1 : 0);
}
