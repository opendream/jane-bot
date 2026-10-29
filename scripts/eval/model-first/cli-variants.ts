/**
 * Measurement-only pick variants (V0–V4) + locked-card simulation.
 * Does not change app runtime. Does not overwrite PR #33 results.md.
 *
 *   npm run eval:pick-variants -- --picker llama --variants v0,v1,v2,v3 --k 3
 */
import crypto from "node:crypto";
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
  loadSeedParaphrase,
  SEED_PARA_GOLD,
  type EvalItem,
} from "./sets.ts";
import { findVerifiedGguf, llamaPicker, stubPicker, type EvalPicker, type PickResponse } from "./pickers.ts";
import {
  HIV_UNDER18_ID,
  LOCKED_IDS,
  VARIANTS,
  type LockPolicy,
  type PromptFamily,
  type ShortlistItem,
  type VariantId,
  type VariantPolicy,
} from "./variants.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CACHE_DIR = path.join(ROOT, "evals/model-first/cache");
const arg = (k: string, d = "") => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = (k: string) => process.argv.includes(k);

function parseVariants(spec: string): VariantId[] {
  const ids = spec.split(",").map((s) => s.trim().toLowerCase() as VariantId);
  for (const id of ids) {
    if (!VARIANTS[id]) throw new Error(`unknown variant ${id}`);
  }
  return ids;
}

function makeInnerPicker(): EvalPicker {
  const spec = arg("--picker", findVerifiedGguf() ? "llama" : "stub:top1");
  if (spec === "llama") return llamaPicker({ threads: Number(arg("--threads", String(os.cpus().length))) });
  if (spec === "stub:top1") return stubPicker("top1");
  if (spec === "stub:always-other") return stubPicker("always-other");
  throw new Error(`unknown picker ${spec}`);
}

function cachedPicker(inner: EvalPicker, familyOf: () => PromptFamily): EvalPicker {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return {
    name: inner.name,
    configure: inner.configure?.bind(inner),
    async pick(text, shortlist, prev, signal) {
      const key = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            family: familyOf(),
            text,
            prev,
            shortlist: shortlist.map((s: ShortlistItem) => [s.id, s.title_th, s.key_fact ?? ""]),
          }),
        )
        .digest("hex");
      const f = path.join(CACHE_DIR, `${key}.json`);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")) as PickResponse;
      const r = await inner.pick(text, shortlist, prev, signal);
      fs.writeFileSync(f, JSON.stringify(r));
      return r;
    },
    close: inner.close?.bind(inner),
  };
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
    modelShown: out.modelShown,
    rulesConfident: out.rulesConfident,
    pickTimedOut: out.pickTimedOut,
  };
}

function fmtPct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

function fmtMs(x: number | null): string {
  return x == null ? "–" : `${Math.round(x)} ms`;
}

function goldOf(setName: string, it: EvalItem): string | undefined {
  if (setName === "seed+paraphrase") return it.label ?? SEED_PARA_GOLD[it.id];
  return it.label;
}

async function runSet(
  items: EvalItem[],
  picker: EvalPicker | null,
  k: number,
  mode: "model-first" | "rules",
  policy: VariantPolicy | null,
  lockPolicy: LockPolicy,
  setName: string,
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
      confidentAgree: policy?.confidentAgree ?? false,
      describe: policy?.describe ?? false,
      fewShot: policy?.fewShot ?? false,
      lockPolicy,
    });
    outs.push({ item, out });
    if ((i + 1) % 20 === 0 || i + 1 === items.length) {
      const tag = policy?.id ?? mode;
      process.stderr.write(`eval ${setName} ${tag} lock=${lockPolicy} k=${k} ${i + 1}/${items.length}\n`);
    }
  }
  const labelled = outs.filter(({ item }) => !!item.label);
  const rows = labelled.map(({ item, out }) => toRow(item, out));
  return { outs, metrics: scoreModelFirst(rows) };
}

interface LockedRow {
  id: string;
  text: string;
  gold?: string;
  lockedId: string;
  confident: boolean;
  shown: string | null;
  via: string;
  wrong: boolean | null;
}

function lockedBreakdown(
  outs: { item: EvalItem; out: EvalTurnOut }[],
  setName: string,
): {
  nLockedTop1: number;
  nLowConf: number;
  nLowConfWrong: number;
  byId: Record<string, { n: number; nLowConf: number; nLowConfWrong: number; nWrong: number }>;
  rows: LockedRow[];
} {
  const byId: Record<string, { n: number; nLowConf: number; nLowConfWrong: number; nWrong: number }> = {};
  for (const id of LOCKED_IDS) byId[id] = { n: 0, nLowConf: 0, nLowConfWrong: 0, nWrong: 0 };
  const rows: LockedRow[] = [];
  for (const { item, out } of outs) {
    const top = out.rulesTop1;
    if (!top || !isLockedCardId(top)) continue;
    const gold = goldOf(setName, item);
    const wrong = gold && gold !== "crisis" && gold !== "none" && out.label !== gold;
    const rec = byId[top] ?? (byId[top] = { n: 0, nLowConf: 0, nLowConfWrong: 0, nWrong: 0 });
    rec.n += 1;
    if (wrong) rec.nWrong += 1;
    if (!out.rulesConfident) {
      rec.nLowConf += 1;
      if (wrong) rec.nLowConfWrong += 1;
    }
    rows.push({
      id: item.id,
      text: item.text,
      gold,
      lockedId: top,
      confident: out.rulesConfident,
      shown: out.cardId,
      via: out.via,
      wrong: gold ? out.label !== gold : null,
    });
  }
  return {
    nLockedTop1: rows.length,
    nLowConf: rows.filter((r) => !r.confident).length,
    nLowConfWrong: rows.filter((r) => !r.confident && r.wrong).length,
    byId,
    rows,
  };
}

function loadHivPrivacyProbes(): { id: string; text: string; expect: string; not?: string; group: string }[] {
  const out: { id: string; text: string; expect: string; not?: string; group: string }[] = [];
  const seen = new Set<string>();
  const add = (text: string, expect: string, group: string, not?: string) => {
    if (seen.has(text)) return;
    seen.add(text);
    out.push({ id: `${group}:${out.length}`, text, expect, not, group });
  };
  for (const q of [
    "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
    "เด็กตรวจเอชไอวีได้ไหม",
    "อยากตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
    "วัยรุ่นตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
    "เด็กตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
  ]) {
    add(q, HIV_UNDER18_ID, "under18_hiv", "disease.hiv.002");
  }
  const price = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/retrieve-prep-price.json"), "utf8"));
  for (const row of price.queries ?? []) {
    if (row.group !== "hiv_privacy") continue;
    add(row.q, row.id, "hiv_privacy", row.not_id);
  }
  const cross = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/retrieve-cross-topic-negatives.json"), "utf8"));
  for (const row of cross.queries ?? []) {
    if (row.group !== "teen_consent_hiv" && row.group !== "adult_hiv_privacy" && row.group !== "hiv_privacy") continue;
    add(
      row.q,
      row.id ?? row.e011cd0?.id,
      row.group,
      row.not_id ?? (row.group === "adult_hiv_privacy" ? HIV_UNDER18_ID : undefined),
    );
  }
  return out;
}

async function runHivProbes(picker: EvalPicker, k: number, policy: VariantPolicy, lockPolicy: LockPolicy) {
  const probes = loadHivPrivacyProbes();
  const rows = [];
  for (const p of probes) {
    const locked = await evalTurn(p.text, {
      cards: BANK,
      picker,
      k,
      timeoutMs: MODEL_FIRST_PICK_TIMEOUT_MS,
      backup: true,
      mode: "model-first",
      age: "18-24",
      confidentAgree: policy.confidentAgree,
      describe: policy.describe,
      fewShot: policy.fewShot,
      lockPolicy: "always",
    });
    const sim = await evalTurn(p.text, {
      cards: BANK,
      picker,
      k,
      timeoutMs: MODEL_FIRST_PICK_TIMEOUT_MS,
      backup: true,
      mode: "model-first",
      age: "18-24",
      confidentAgree: policy.confidentAgree,
      describe: policy.describe,
      fewShot: policy.fewShot,
      lockPolicy,
    });
    const moved = locked.cardId !== sim.cardId || locked.label !== sim.label;
    const expectOk = !p.expect || sim.label === p.expect || sim.cardId === p.expect;
    const notOk = p.not ? sim.cardId !== p.not && sim.label !== p.not : true;
    rows.push({
      text: p.text,
      group: p.group,
      expect: p.expect,
      not: p.not,
      lockedCard: locked.cardId,
      simCard: sim.cardId,
      simVia: sim.via,
      simModelCalls: sim.modelCalls,
      moved,
      expectOk,
      notOk,
    });
  }
  return {
    n: rows.length,
    nMoved: rows.filter((r) => r.moved).length,
    nExpectFail: rows.filter((r) => !r.expectOk).length,
    nNotFail: rows.filter((r) => !r.notOk).length,
    rows,
  };
}

function compactItem(item: EvalItem, out: EvalTurnOut, setName: string) {
  return {
    id: item.id,
    label: goldOf(setName, item),
    predicted: out.label,
    via: out.via,
    cardId: out.cardId,
    rulesTop1: out.rulesTop1,
    rulesConfident: out.rulesConfident,
    locked: out.locked,
    modelCalls: out.modelCalls,
    modelShown: out.modelShown,
    modelPickId: out.modelPickId,
    pickTimedOut: out.pickTimedOut,
    fallback: out.fallback,
    latencyMs: out.latencyMs,
    promptTokens: out.promptTokens,
    shortlistIds: out.shortlistIds,
  };
}

async function main() {
  const inner = makeInnerPicker();
  let family: PromptFamily = "titles";
  const picker = cachedPicker(inner, () => family);
  const variantIds = parseVariants(arg("--variants", flag("--v4") ? "v0,v1,v2,v3,v4" : "v0,v1,v2,v3"));
  const ksAll = arg("--k", "3").split(",").map(Number);
  const judged = loadJudged();
  const seedPara = loadSeedParaphrase();
  const crisis = loadCrisisHeldout();
  const sets: { name: string; items: EvalItem[] }[] = [
    { name: "judged868", items: judged },
    { name: "seed+paraphrase", items: seedPara },
    { name: "crisis-heldout", items: crisis },
  ];

  const vm = {
    cpu: (os.cpus()[0]?.model ?? "unknown").replace(/\s+/g, " ").trim(),
    threads: os.cpus().length,
    picker: inner.name,
    timeoutMs: MODEL_FIRST_PICK_TIMEOUT_MS,
    ggufSha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",
    note: "cloud VM numbers; phone numbers are 23 Oct figures (1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank)",
    labels: "agent-judged, pending human spot-check",
  };

  const familiesNeeded = [...new Set(variantIds.map((id) => VARIANTS[id].promptFamily))];
  const byFamily: Record<string, VariantId[]> = {};
  for (const id of variantIds) {
    const f = VARIANTS[id].promptFamily;
    (byFamily[f] ??= []).push(id);
  }

  let md = `# Model-first pick variants (measurement only)\n\n`;
  md += `${vm.note}\n\n`;
  md += `VM: ${vm.cpu}, ${vm.threads} threads (logical CPUs). Picker: \`${vm.picker}\`. Pick timeout ${vm.timeoutMs} ms. Bank: 35 reviewed cards. Eval/harness only — no \`src/\` runtime change. GGUF sha256 \`${vm.ggufSha256}\`.\n\n`;
  md += `Phone (23 Oct, not this run): 1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank.\n\n`;
  md += `Judged labels are agent-judged, pending human spot-check. Crisis / guard / chip / locked-top-1 never call the model (runtime lock unchanged). Every variant still calls the model on every non-locked free-text turn.\n\n`;
  md += `Target: wrong-card ≤ rules-only (15.0% judged / 17.9% seed+paraphrase) while the model still answers every non-locked free-text turn.\n\n`;
  md += `Variants:\n`;
  md += `- **V0** current model-first (reproduce PR #33 baseline).\n`;
  md += `- **V1** confident-agree: model picks every non-locked turn; if rules were confident and the model disagrees or says none, show the rules card (\`rules-fallback\`).\n`;
  md += `- **V2** card descriptions: V0 prompt with title + first reviewed key_fact per shortlisted card.\n`;
  md += `- **V3** V1 + V2.\n`;
  md += `- **V4** V3 + 2 synthetic Thai few-shot examples (optional).\n\n`;

  const report: any = { vm, generated: new Date().toISOString(), variants: variantIds, sets: [] };

  try {
    for (const set of sets) {
      md += `## ${set.name} (n=${set.items.length})\n\n`;
      const rules = await runSet(set.items, picker, 5, "rules", null, "always", set.name);
      const lockedNow = lockedBreakdown(rules.outs, set.name);
      const r = rules.metrics;
      md += `| Policy | k | Acc | Wrong-card | None | Fallback | Model-shown | Agree rules top-1 | Crisis recall | Timeouts | Latency med/p90 | Prompt tok med |\n`;
      md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
      md += `| rules-only | – | ${fmtPct(r.accuracy)} | ${fmtPct(r.wrongCardRate)} | ${fmtPct(r.noneRate)} | ${fmtPct(r.fallbackRate)} | – | – | ${fmtPct(r.crisisRecall)} | 0 | – | – |\n`;

      const setBlock: any = {
        set: set.name,
        n: set.items.length,
        rulesOnly: r,
        lockedCurrent: { nLockedTop1: lockedNow.nLockedTop1, nLowConf: lockedNow.nLowConf, nLowConfWrong: lockedNow.nLowConfWrong, byId: lockedNow.byId },
        variants: {},
      };

      const kPrimary = ksAll[0] ?? 3;
      for (const fam of familiesNeeded) {
        const group = byFamily[fam];
        if (!group?.length) continue;
        const representative = VARIANTS[group[0]];
        family = fam;
        picker.configure?.({ describe: representative.describe, fewShot: representative.fewShot });
        const inferred = await runSet(set.items, picker, kPrimary, "model-first", representative, "always", set.name);
        for (const vid of group) {
          const policy = VARIANTS[vid];
          family = policy.promptFamily;
          picker.configure?.({ describe: policy.describe, fewShot: policy.fewShot });
          const run = policy.id === representative.id
            ? inferred
            : await runSet(set.items, picker, kPrimary, "model-first", policy, "always", set.name);
          const m = run.metrics;
          md += `| ${vid} ${policy.name} | ${kPrimary} | ${fmtPct(m.accuracy)} | ${fmtPct(m.wrongCardRate)} | ${fmtPct(m.noneRate)} | ${fmtPct(m.fallbackRate)} | ${fmtPct(m.modelShownRate)} | ${fmtPct(m.agreeRulesTop1Rate)} | ${fmtPct(m.crisisRecall)} | ${m.nTimeouts} | ${fmtMs(m.latencyMsMedian)} / ${fmtMs(m.latencyMsP90)} | ${m.promptTokensMedian ?? "–"} |\n`;
          setBlock.variants[vid] = {
            k: kPrimary,
            metrics: m,
            items: run.outs.map(({ item, out }) => compactItem(item, out, set.name)),
          };
        }
      }
      md += `\n`;

      md += `### Locked-card routing (current always-lock, rules top-1)\n\n`;
      md += `Queries whose rules top-1 is a locked card. Low-confidence = not the existing +1 unique-hit margin.\n\n`;
      md += `| Locked id | n top-1 | low-conf | low-conf wrong | all wrong |\n`;
      md += `| --- | --- | --- | --- | --- |\n`;
      for (const id of LOCKED_IDS) {
        const b = lockedNow.byId[id];
        md += `| ${id} | ${b.n} | ${b.nLowConf} | ${b.nLowConfWrong} | ${b.nWrong} |\n`;
      }
      md += `| **total** | ${lockedNow.nLockedTop1} | ${lockedNow.nLowConf} | ${lockedNow.nLowConfWrong} | – |\n\n`;

      report.sets.push(setBlock);
    }

    const bestId = pickBest(report);
    const extraK = ksAll.filter((k) => k !== (ksAll[0] ?? 3));
    if (bestId && extraK.length) {
      md += `## Extra k on best variant (${bestId})\n\n`;
      const policy = VARIANTS[bestId];
      family = policy.promptFamily;
      picker.configure?.({ describe: policy.describe, fewShot: policy.fewShot });
      md += `| Set | k | Acc | Wrong-card | None | Fallback | Model-shown | Timeouts | Latency med/p90 | Prompt tok med |\n`;
      md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
      for (const set of sets.filter((s) => s.name !== "crisis-heldout")) {
        for (const k of extraK) {
          const run = await runSet(set.items, picker, k, "model-first", policy, "always", set.name);
          const m = run.metrics;
          md += `| ${set.name} | ${k} | ${fmtPct(m.accuracy)} | ${fmtPct(m.wrongCardRate)} | ${fmtPct(m.noneRate)} | ${fmtPct(m.fallbackRate)} | ${fmtPct(m.modelShownRate)} | ${m.nTimeouts} | ${fmtMs(m.latencyMsMedian)} / ${fmtMs(m.latencyMsP90)} | ${m.promptTokensMedian ?? "–"} |\n`;
          const block = report.sets.find((s: any) => s.set === set.name);
          if (block) block.variants[`${bestId}_k${k}`] = { k, metrics: m };
        }
      }
      md += `\n`;
    }

    md += `## Lock-only-on-confident simulation (eval only; runtime lock unchanged)\n\n`;
    md += `Proposal: lock only when rules are confident. Low-confidence locked top-1 goes to the model shortlist like any other turn. A locked card can still only be shown if rules shortlisted it. \`hiv.test.under18.000\` still requires the under-18 privacy shortlist gate.\n\n`;
    const simPolicy = VARIANTS[bestId ?? "v0"];
    family = simPolicy.promptFamily;
    picker.configure?.({ describe: simPolicy.describe, fewShot: simPolicy.fewShot });
    const kSim = ksAll[0] ?? 3;
    md += `Simulated on **${simPolicy.id}** k=${kSim}.\n\n`;
    md += `| Set | Policy | Acc | Wrong-card | None | Fallback | Model-shown |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- |\n`;
    const simBlocks: any[] = [];
    for (const set of sets.filter((s) => s.name !== "crisis-heldout")) {
      const sim = await runSet(set.items, picker, kSim, "model-first", simPolicy, "confident-only", set.name);
      const m = sim.metrics;
      md += `| ${set.name} | ${simPolicy.id} + lock-if-confident | ${fmtPct(m.accuracy)} | ${fmtPct(m.wrongCardRate)} | ${fmtPct(m.noneRate)} | ${fmtPct(m.fallbackRate)} | ${fmtPct(m.modelShownRate)} |\n`;
      simBlocks.push({ set: set.name, metrics: m, locked: lockedBreakdown(sim.outs, set.name) });
    }
    md += `\n`;

    const hiv = await runHivProbes(picker, kSim, simPolicy, "confident-only");
    md += `### Under-18 HIV-privacy probes (must not move)\n\n`;
    md += `${hiv.n} probes from retrieve fixtures + under-18 HIV questions. Moved vs always-lock: **${hiv.nMoved}**. Expect-id failures: ${hiv.nExpectFail}. Forbidden-id failures: ${hiv.nNotFail}.\n\n`;
    if (hiv.nMoved || hiv.nExpectFail || hiv.nNotFail) {
      md += `| Probe | group | always-lock | sim | moved |\n`;
      md += `| --- | --- | --- | --- | --- |\n`;
      for (const row of hiv.rows.filter((r) => r.moved || !r.expectOk || !r.notOk)) {
        md += `| ${row.text} | ${row.group} | ${row.lockedCard} | ${row.simCard} (${row.simVia}) | ${row.moved ? "yes" : "no"} |\n`;
      }
      md += `\n`;
    } else {
      md += `No under-18 HIV-privacy probe moved.\n\n`;
    }
    report.lockSim = { policy: simPolicy.id, k: kSim, sets: simBlocks, hivPrivacy: hiv };

    md += targetAndRecommend(report, bestId);
    md += `\n## Unverified\n\n`;
    md += `- Judged labels are agent-judged, pending human spot-check.\n`;
    md += `- llama.cpp CPU is not bit-stable across sequential passes; V0 may differ from PR #33 by a small number of items.\n`;
    md += `- Phone latency is the 23 Oct figure, not this VM.\n`;
    md += `- Runtime lock is unchanged; lock-if-confident is harness simulation only.\n`;
  } finally {
    await picker.close?.();
  }

  const outDir = path.join(ROOT, "evals/model-first");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "variants.md"), md);
  fs.writeFileSync(path.join(outDir, "variants.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(md);
}

function pickBest(report: any): VariantId | null {
  const judged = report.sets.find((s: any) => s.set === "judged868");
  if (!judged) return null;
  const rulesWrong = judged.rulesOnly.wrongCardRate;
  const ids = Object.keys(judged.variants) as VariantId[];
  const meet = ids.filter((id) => judged.variants[id].metrics.wrongCardRate <= rulesWrong + 1e-12);
  const seed = report.sets.find((s: any) => s.set === "seed+paraphrase");
  const seedWrong = seed?.rulesOnly.wrongCardRate ?? 1;
  const meetBoth = meet.filter((id) => !seed || seed.variants[id]?.metrics.wrongCardRate <= seedWrong + 1e-12);
  const pool = meetBoth.length ? meetBoth : meet.length ? meet : ids;
  pool.sort((a, b) => judged.variants[b].metrics.accuracy - judged.variants[a].metrics.accuracy);
  return pool[0] ?? null;
}

function targetAndRecommend(report: any, bestId: VariantId | null): string {
  const judged = report.sets.find((s: any) => s.set === "judged868");
  const seed = report.sets.find((s: any) => s.set === "seed+paraphrase");
  if (!judged) return "";
  const jWrong = judged.rulesOnly.wrongCardRate;
  const sWrong = seed?.rulesOnly.wrongCardRate ?? 1;
  let md = `## Target and recommendation\n\n`;
  const rows: string[] = [];
  for (const id of Object.keys(judged.variants)) {
    const jm = judged.variants[id].metrics;
    const sm = seed?.variants[id]?.metrics;
    const okJ = jm.wrongCardRate <= jWrong + 1e-12;
    const okS = !sm || sm.wrongCardRate <= sWrong + 1e-12;
    const answers = jm.modelShownRate > 0 && jm.nModelShown > 0;
    const meet = okJ && okS && answers;
    rows.push(
      `- **${id}**: judged wrong-card ${fmtPct(jm.wrongCardRate)} (rules ${fmtPct(jWrong)})${okJ ? " ≤" : " >"} ; seed+para ${sm ? fmtPct(sm.wrongCardRate) : "–"} (rules ${fmtPct(sWrong)}); model-shown ${fmtPct(jm.modelShownRate)}${meet ? " — **meets target**" : ""}.`,
    );
  }
  md += rows.join("\n") + "\n\n";
  const meets = Object.keys(judged.variants).filter((id) => {
    const jm = judged.variants[id].metrics;
    const sm = seed?.variants[id]?.metrics;
    return jm.wrongCardRate <= jWrong + 1e-12 && (!sm || sm.wrongCardRate <= sWrong + 1e-12) && jm.nModelShown > 0;
  });
  if (meets.length) {
    md += `**Meets target:** ${meets.join(", ")}. Closest/best accuracy among them: **${bestId}**.\n\n`;
  } else {
    md += `**None meets the target on both sets.** Closest (lowest judged wrong-card among variants that still show the model): **${bestId}**.\n\n`;
  }
  const sim = report.lockSim;
  if (sim) {
    const jsim = sim.sets.find((s: any) => s.set === "judged868");
    const ssim = sim.sets.find((s: any) => s.set === "seed+paraphrase");
    md += `Lock-if-confident simulation on ${sim.policy} k=${sim.k}: judged acc ${jsim ? fmtPct(jsim.metrics.accuracy) : "–"} / wrong-card ${jsim ? fmtPct(jsim.metrics.wrongCardRate) : "–"}; seed+para acc ${ssim ? fmtPct(ssim.metrics.accuracy) : "–"} / wrong-card ${ssim ? fmtPct(ssim.metrics.wrongCardRate) : "–"}. HIV-privacy probes moved: ${sim.hivPrivacy.nMoved}/${sim.hivPrivacy.n}.\n\n`;
    if (sim.hivPrivacy.nMoved === 0) {
      md += `Recommendation: keep the runtime lock as-is for this PR. The lock-if-confident simulation does not move under-18 HIV-privacy probes`;
      if (jsim && jsim.metrics.wrongCardRate < jWrong) md += ` and it lowers judged wrong-card vs always-lock`;
      md += `. Consider it as a follow-up measurement, not a runtime change.\n`;
    } else {
      md += `Recommendation: do **not** relax the runtime lock — under-18 HIV-privacy probes moved under the simulation.\n`;
    }
  }
  return md;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
