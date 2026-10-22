#!/usr/bin/env node
// Import both Dialogflow exports into the PRIVATE review queue (plan §2). Never writes inside the repo.
//   node scripts/bank/import-df.mjs --bot /workspace/jane-df/sex-safe-safe-bot --jane /workspace/jane-df/sex-safe-safe-jane \
//        --out /workspace/unicef-coder/jane-private/review-queue
// Writes (all mode 0600):  intents.jsonl (normalised, merged, PII-scrubbed, phrases included for the off-repo held-out set)
//                          review-queue.jsonl (one item per intent, status needs-review)  pii-hits.jsonl (for the human check)
//                          summary.json (counts only)
// Stdout: counts only, never export text.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readExport, mergeExports, toQueueItem, piiHits } from "./df-lib.mjs";
import { scrubPII } from "./pii-patterns.mjs";
import { publicHandles } from "./guard.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

export function runImport({ bot, jane, out, now = new Date() }) {
  const outDir = path.resolve(out);
  const rel = path.relative(repo, outDir);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) throw new Error("refusing to write the review queue inside the repo; use a dir outside it (e.g. ../jane-private/)");
  const B = readExport(bot, "bot"), J = readExport(jane, "jane");
  const { merged, stats } = mergeExports(B, J);
  const opts = { allowHandles: publicHandles() };
  const queue = merged.map((r) => toQueueItem(r, opts));
  const hits = merged.flatMap((r) => piiHits(r, opts));
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const write = (f, s) => fs.writeFileSync(path.join(outDir, f), s, { mode: 0o600 });
  const scrubbed = merged.map((r) => ({ name: r.name, origin: r.origin, inputContexts: r.inputContexts, parent: !!r.parentId, conflict: r.conflict,
    phrases: r.phrases.map((p) => scrubPII(p, opts).text) }));
  write("intents.jsonl", scrubbed.map((x) => JSON.stringify(x)).join("\n") + "\n");
  write("review-queue.jsonl", queue.map((x) => JSON.stringify(x)).join("\n") + "\n");
  write("pii-hits.jsonl", hits.map((x) => JSON.stringify(x)).join("\n") + (hits.length ? "\n" : ""));
  const sum = (k) => queue.reduce((a, q) => a + q.stripped[k], 0);
  const summary = {
    generated: now.toISOString(), status: "needs-review",
    intents: { bot: stats.bot, jane: stats.jane, unique: stats.unique, overlap: stats.overlap, identical: stats.identical, bot_only: stats.botOnly, jane_only: stats.janeOnly.length },
    conflicts: stats.conflicts, phrase_diff_only: stats.phraseDiffOnly.length, jane_only: stats.janeOnly,
    phrases: { unique: stats.uniquePhrases, multi_intent: stats.multiIntentPhrases, context_free_conflicts: stats.phraseConflicts },
    medical_review: queue.filter((q) => q.review.medical_review).length,
    pii: { items_with_hits: queue.filter((q) => q.pii.count).length, hits_total: hits.length,
      by_category: hits.reduce((a, h) => ((a[h.category] = (a[h.category] ?? 0) + 1), a), {}) },
    stripped: Object.fromEntries(["fbPayloads", "linePayloads", "cards", "images", "customPayloads", "buttons", "shortLinks", "imageLinks", "facebookLinks", "otherLinks", "linkCandidates"].map((k) => [k, sum(k)])),
  };
  write("summary.json", JSON.stringify(summary, null, 2) + "\n");
  return { summary, queue, outDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const bot = arg("--bot"), jane = arg("--jane"), out = arg("--out");
  if (!bot || !jane || !out) { console.error("usage: import-df.mjs --bot DIR --jane DIR --out DIR (outside the repo)"); process.exit(2); }
  const { summary, outDir } = runImport({ bot, jane, out });
  // Counts only (intent names of conflicts are fine: they are system names, not user text).
  console.log(JSON.stringify({ outDir, ...summary, jane_only: summary.jane_only.length }, null, 2));
}
