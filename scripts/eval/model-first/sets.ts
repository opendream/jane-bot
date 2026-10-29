import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export interface EvalItem {
  id: string;
  text: string;
  set: string;
  label?: string;
  stratum?: string;
}

function readJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

export function loadSeedParaphrase(): EvalItem[] {
  const seed = readJson("evals/seed-set.json");
  const para = readJson("evals/paraphrase-set.json");
  const out: EvalItem[] = [];
  for (const it of seed.items) {
    out.push({
      id: it.id,
      text: it.text,
      set: "seed",
      label: it.crisis ? "crisis" : SEED_PARA_GOLD[it.id],
    });
  }
  for (const it of para.items) {
    out.push({ id: it.id, text: it.text, set: "paraphrase", label: SEED_PARA_GOLD[it.id] });
  }
  return out;
}

export function loadCrisisHeldout(): EvalItem[] {
  const fp = readJson("evals/crisis-fp-set.json");
  return (fp.heldout_crisis ?? []).map((it: { id: string; text: string }) => ({
    id: it.id,
    text: it.text,
    set: "heldout_crisis",
    label: "crisis",
  }));
}

export function loadReview868(): EvalItem[] {
  const queries = readJson("evals/review868/queries.json") as string[];
  return queries.map((text, i) => ({ id: `r${String(i).padStart(3, "0")}`, text, set: "review868" }));
}

export function loadJudged(): EvalItem[] {
  const judged = readJson("evals/review868/judged.json");
  return (judged.items as { id: string; text: string; label: string; stratum?: string; q_index: number }[]).map((it) => ({
    id: it.id,
    text: it.text,
    set: "judged",
    label: it.label,
    stratum: it.stratum,
  }));
}

/** Best-effort gold cards for seed/paraphrase backup measurement (reviewed bank only). */
export const SEED_PARA_GOLD: Record<string, string> = {
  h01: "pregnancy.ornot.000",
  h02: "pregnancy.signs.when.000",
  h03: "pregnancy.notthetime.000",
  h04: "pregnancy.ornot.000",
  h05: "condom.leak.000",
  h06: "ec.timing.b001",
  h07: "birth.control.pills.000",
  h08: "birth.control.000",
  h09: "birth.control.implant.000",
  h10: "none",
  h11: "hiv.test.under18.000",
  h12: "disease.hiv.002",
  h13: "protection.prep.000",
  h14: "sex.activity.consent.000",
  h15: "sex.activity.consent.000",
  h16: "none",
  h17: "none",
  h18: "relationship.violence.001",
  h19: "relationship.violence.001",
  h20: "none",
  s01: "crisis", s02: "crisis", s03: "crisis", s04: "crisis", s05: "crisis",
  s06: "crisis", s07: "crisis", s08: "crisis", s09: "crisis", s10: "crisis",
  n01: "none",
  n02: "disease.hiv.002",
  p01: "pregnancy.ornot.000",
  p02: "pregnancy.notthetime.000",
  p03: "pregnancy.signs.when.000",
  p04: "ec.timing.b001",
  p05: "condom.leak.000",
  p06: "ec.timing.b001",
  p07: "birth.control.000",
  p08: "birth.control.implant.000",
  p09: "birth.control.pills.000",
  p10: "disease.gonorrhea.001",
  p11: "disease.hiv.002",
  p12: "hiv.test.under18.000",
  p13: "sex.activity.consent.000",
  p14: "sex.activity.consent.000",
  p15: "relationship.violence.001",
  p16: "none", p17: "none", p18: "none", p19: "none",
  p20: "relationship.violence.001",
  p21: "relationship.violence.001",
  p22: "relationship.violence.001",
  p23: "none",
  p24: "none",
};

export function maybeLoadReviewPack(): EvalItem[] {
  const p = path.join(ROOT, "evals/review-pack.json");
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const items = data.items ?? data.queries ?? [];
  return items.map((it: any, i: number) => ({
    id: it.id ?? `rp${i}`,
    text: it.text ?? it.q ?? it,
    set: "review-pack",
    label: it.label,
  }));
}
