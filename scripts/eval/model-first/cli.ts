/**
 * Measurement-only model-first eval. Does not change app runtime.
 *   npm run eval:model-first -- --picker stub:top1
 *   npm run eval:model-first -- --picker llama
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BANK } from "../../../src/core/bankData.ts";
import { isLockedCardId } from "./locked.ts";
import { evalTurn, MODEL_FIRST_PICK_TIMEOUT_MS, type EvalTurnOut } from "./harness.ts";
import { scoreModelFirst, type ScoreRow } from "./metrics.ts";
import {
  loadCrisisHeldout,
  loadJudged,
  loadReview868,
  loadSeedParaphrase,
  maybeLoadReviewPack,
  SEED_PARA_GOLD,
  type EvalItem,
} from "./sets.ts";
import { findVerifiedGguf, llamaPicker, stubPicker, type EvalPicker } from "./pickers.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const arg = (k: string, d = "") => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = (k: string) => process.argv.includes(k);

function makePicker(): EvalPicker {
  const spec = arg("--picker", findVerifiedGguf() ? "llama" : "stub:top1");
  if (spec === "llama") return llamaPicker({ threads: Number(arg("--threads", String(os.cpus().length))) });
  if (spec === "stub:top1") return stubPicker("top1");
  if (spec === "stub:always-other") return stubPicker("always-other");
  if (spec.startsWith("stub:index:")) return stubPicker("forced-index", Number(spec.slice("stub:index:".length)));
  throw new Error(`unknown picker ${spec}`);
}

function toRow(item: EvalItem, out: EvalTurnOut): ScoreRow {
  return {
    label: item.label ?? "",
    predicted: out.label,
    modelCalls: out.modelCalls,
    fallback: out.fallback,
    noCandidates: out.noCandidates,
    via: out.via,
    cardId: out.cardId,
    locked: out.locked || (!!item.label && isLockedCardId(item.label)),
    latencyMs: out.latencyMs,
    promptTokens: out.promptTokens,
    agreeRulesTop1: out.agreeRulesTop1,
  };
}

function fmtPct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

function fmtMs(x: number | null): string {
  return x == null ? "–" : `${Math.round(x)} ms`;
}

async function runSet(
  items: EvalItem[],
  picker: EvalPicker | null,
  k: number,
  mode: "model-first" | "rules",
  setName = "",
) {
  const outs: { item: EvalItem; out: EvalTurnOut }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const out = await evalTurn(item.text, {
      cards: BANK,
      picker: mode === "model-first" ? picker : null,
      k,
      timeoutMs: MODEL_FIRST_PICK_TIMEOUT_MS,
      backup: true,
      mode,
      age: "18-24",
      describe: arg("--policy") === "v3",
      confidentAgree: arg("--policy") === "v3",
    });
    outs.push({ item, out });
    if ((i + 1) % 20 === 0 || i + 1 === items.length) {
      process.stderr.write(`eval ${setName} ${mode} k=${k} ${i + 1}/${items.length}\n`);
    }
  }
  const labelled = outs.filter(({ item }) => !!item.label);
  const rows = labelled.map(({ item, out }) => toRow(item, out));
  return { outs, metrics: scoreModelFirst(rows) };
}

function backupReport(
  items: EvalItem[],
  outs: { item: EvalItem; out: EvalTurnOut }[],
  goldOf: (it: EvalItem) => string | undefined,
) {
  const rows = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const out = outs[i].out;
    const gold = goldOf(item);
    if (out.kind === "crisis") continue;
    if (out.rulesCandidateCount !== 0) continue;
    const inTop3 = !!(gold && gold !== "none" && gold !== "crisis" && out.backupIds.includes(gold));
    let pick: "correct" | "wrong" | "none" | "no-backup" = "no-backup";
    if (out.backupUsed && out.backupIds.length) {
      if (!out.cardId || out.cardId === "general.fallback.000" || out.label === "none") pick = "none";
      else if (gold && out.label === gold) pick = "correct";
      else pick = "wrong";
    }
    rows.push({ id: item.id, gold, inTop3, pick, backupIds: out.backupIds, predicted: out.label });
  }
  const withGold = rows.filter((r) => r.gold && r.gold !== "none" && r.gold !== "crisis");
  const nCrisisEarly = outs.filter((o) => o.out.kind === "crisis").length;
  return {
    nNoRules: rows.length,
    nRetrieveEmptyInclCrisis: rows.length + nCrisisEarly,
    nWithGoldCard: withGold.length,
    recallAt3: withGold.filter((r) => r.inTop3).length,
    pickCorrect: rows.filter((r) => r.pick === "correct").length,
    pickWrong: rows.filter((r) => r.pick === "wrong").length,
    pickNone: rows.filter((r) => r.pick === "none").length,
  };
}

async function main() {
  const picker = makePicker();
  const ks = (arg("--k", "3,5")).split(",").map(Number);
  const judged = loadJudged();
  const seedPara = loadSeedParaphrase();
  const crisis = loadCrisisHeldout();
  const reviewPack = maybeLoadReviewPack();
  const sets: { name: string; items: EvalItem[]; gold: (it: EvalItem) => string | undefined }[] = [
    { name: "judged868", items: judged, gold: (it) => it.label },
    { name: "seed+paraphrase", items: seedPara, gold: (it) => it.label ?? SEED_PARA_GOLD[it.id] },
    { name: "crisis-heldout", items: crisis, gold: () => "crisis" },
  ];
  if (reviewPack.length) sets.push({ name: "review-pack", items: reviewPack, gold: (it) => it.label });
  if (flag("--review868")) {
    sets.push({ name: "review868", items: loadReview868(), gold: () => undefined });
  }

  const vm = {
    cpu: (os.cpus()[0]?.model ?? "unknown").replace(/\s+/g, " ").trim(),
    threads: os.cpus().length,
    picker: picker.name,
    timeoutMs: MODEL_FIRST_PICK_TIMEOUT_MS,
    ggufSha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",
    note: "cloud VM numbers; phone numbers are 23 Oct figures (1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank)",
  };

  const blocks: any[] = [];
  let md = `# Model-first eval (measurement only)\n\n`;
  md += `${vm.note}\n\n`;
  md += `VM: ${vm.cpu}, ${vm.threads} threads (logical CPUs). Picker: \`${vm.picker}\`. Pick timeout ${vm.timeoutMs} ms. Bank: 35 reviewed cards at this commit. Backup shortlist is harness-only (not src/ runtime).\n\n`;
  md += `Phone (23 Oct, not this run): 1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank.\n\n`;

  try {
    for (const set of sets) {
      md += `## ${set.name} (n=${set.items.length})\n\n`;
      const rules = await runSet(set.items, picker, 5, "rules", set.name);
      md += `| Policy | k | Acc | Wrong-card | Crisis recall | Crisis model calls | Locked integrity | Fallback | No-cand | Agree rules top-1 | Latency med/p90 | Prompt tok med |\n`;
      md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
      const r = rules.metrics;
      md += `| rules-only | – | ${fmtPct(r.accuracy)} | ${fmtPct(r.wrongCardRate)} | ${fmtPct(r.crisisRecall)} | ${r.crisisModelCalls} | ${fmtPct(r.lockedIntegrity)} | ${fmtPct(r.fallbackRate)} | ${fmtPct(r.noCandidateRate)} | – | – | – |\n`;
      const setBlock: any = { set: set.name, n: set.items.length, rulesOnly: r, k: {} };
      for (const k of ks) {
        const mf = await runSet(set.items, picker, k, "model-first", set.name);
        const m = mf.metrics;
        md += `| model-first | ${k} | ${fmtPct(m.accuracy)} | ${fmtPct(m.wrongCardRate)} | ${fmtPct(m.crisisRecall)} | ${m.crisisModelCalls} | ${fmtPct(m.lockedIntegrity)} | ${fmtPct(m.fallbackRate)} | ${fmtPct(m.noCandidateRate)} | ${fmtPct(m.agreeRulesTop1Rate)} | ${fmtMs(m.latencyMsMedian)} / ${fmtMs(m.latencyMsP90)} | ${m.promptTokensMedian ?? "–"} |\n`;
        const backup = backupReport(set.items, mf.outs, set.gold);
        setBlock.k[k] = { metrics: m, backup };
      }
      md += `\n`;
      const b3 = setBlock.k[3]?.backup;
      const b5 = setBlock.k[5]?.backup;
      if (b3) {
        md += `Backup shortlist (char 2–3-gram BM25 top-3 on turns where rules retrieve 0 candidates; locked cards excluded; crisis turns never consult it):\n`;
        if (set.name === "seed+paraphrase") {
          md += `- Retrieve-empty including crisis: ${b3.nRetrieveEmptyInclCrisis}/${set.items.length} (backup never runs on crisis). Backup-eligible after excluding crisis: ${b3.nNoRules}.\n`;
        }
        md += `- k=3: ${b3.nNoRules} no-rules items, ${b3.nWithGoldCard} with a gold card, recall@3 ${b3.recallAt3}/${b3.nWithGoldCard}; model pick correct ${b3.pickCorrect} / wrong ${b3.pickWrong} / none ${b3.pickNone}.\n`;
        if (b5) md += `- k=5: ${b5.nNoRules} no-rules items, recall@3 ${b5.recallAt3}/${b5.nWithGoldCard}; pick correct ${b5.pickCorrect} / wrong ${b5.pickWrong} / none ${b5.pickNone}.\n`;
        md += `\n`;
      }
      blocks.push(setBlock);
    }
  } finally {
    await picker.close?.();
  }

  const outDir = path.join(ROOT, "evals/model-first");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "results.md"), md);
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ vm, generated: new Date().toISOString(), sets: blocks }, null, 2) + "\n");
  process.stdout.write(md);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
