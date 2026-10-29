import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import crisisFp from "../../evals/crisis-fp-set.json";
import seed from "../../evals/seed-set.json";
import paraphrase from "../../evals/paraphrase-set.json";
import judged from "../../evals/review868/judged.json";
import { detectChatCrisisForTurn } from "../../src/core/chat-crisis";
import { detectCrisis } from "../../src/core/crisis";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type TurnDeps } from "../../src/core/dialog";

// SYNTHETIC eval/fixture texts only. Counts and ids; never user logs.

type Item = { id: string; text: string };
type SetCount = { hits: number; total: number };

const cardDeps = (): TurnDeps => ({ cards: BANK, copyStatus: "draft" });
const chatDeps = (): TurnDeps => ({ cards: BANK, copyStatus: "draft", chatFirst: true });

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(rel, "utf8"));
}

function retrieveQueries(rel: string, set: string): Item[] {
  const data = loadJson(rel) as { queries: { q: string }[] };
  return data.queries.map((row, i) => ({ id: `${set}-${i}`, text: row.q }));
}

function review868Normal(): Item[] {
  const queries = loadJson("evals/review868/queries.json") as string[];
  const out: Item[] = [];
  for (let i = 0; i < queries.length; i++) {
    const text = queries[i];
    if (detectCrisis(text).crisis) continue;
    out.push({ id: `r${String(i).padStart(3, "0")}`, text });
  }
  return out;
}

function normalSets(): { name: string; items: Item[] }[] {
  const fp = crisisFp as { harmless: Item[]; heldout_harmless: Item[] };
  const seedItems = (seed as { items: { id: string; text: string; crisis?: boolean }[] }).items
    .filter((x) => x.crisis !== true)
    .map((x) => ({ id: x.id, text: x.text }));
  const paraItems = (paraphrase as { items: Item[] }).items;
  const judgedItems = (judged as { items: { id: string; text: string; label: string }[] }).items
    .filter((x) => x.label !== "crisis")
    .map((x) => ({ id: x.id, text: x.text }));
  return [
    { name: "crisis-fp-harmless", items: fp.harmless },
    { name: "crisis-fp-heldout-harmless", items: fp.heldout_harmless },
    { name: "seed-normal", items: seedItems },
    { name: "paraphrase", items: paraItems },
    { name: "review868-judged-non-crisis", items: judgedItems },
    { name: "review868-queries-non-pinned", items: review868Normal() },
    { name: "retrieve-c450", items: retrieveQueries("tests/fixtures/retrieve-c450-baseline.json", "c450") },
    { name: "retrieve-e948", items: retrieveQueries("tests/fixtures/retrieve-e948-baseline.json", "e948") },
    { name: "retrieve-476b992", items: retrieveQueries("tests/fixtures/retrieve-476b992-baseline.json", "476") },
    { name: "retrieve-routing-extra", items: retrieveQueries("tests/fixtures/retrieve-routing-extra.json", "extra") },
    { name: "retrieve-prep-price", items: retrieveQueries("tests/fixtures/retrieve-prep-price.json", "prep") },
    { name: "retrieve-cross-topic-negatives", items: retrieveQueries("tests/fixtures/retrieve-cross-topic-negatives.json", "xtopic") },
  ];
}

/** Extra-check FP: pin missed, extra check hit. Ids only — never the text. */
function extraHit(text: string): boolean {
  if (detectCrisis(text).crisis) return false;
  return detectChatCrisisForTurn(text, []).crisis;
}

function scanDetector(items: Item[]): SetCount {
  let hits = 0;
  for (const x of items) if (extraHit(x.text)) hits++;
  return { hits, total: items.length };
}

async function scanPath(items: Item[], deps: TurnDeps): Promise<SetCount> {
  let hits = 0;
  for (const x of items) {
    if (detectCrisis(x.text).crisis) continue;
    const r = await runTurn(newDialog(), x.text, deps);
    if (r.reply.kind === "crisis") hits++;
  }
  return { hits, total: items.length };
}

function scanAllDetector(): Record<string, SetCount> {
  const out: Record<string, SetCount> = {};
  for (const s of normalSets()) out[s.name] = scanDetector(s.items);
  return out;
}

async function scanAllPath(deps: TurnDeps): Promise<Record<string, SetCount> & { all: SetCount }> {
  const out: Record<string, SetCount> = {};
  let hits = 0;
  let total = 0;
  for (const s of normalSets()) {
    const c = await scanPath(s.items, deps);
    out[s.name] = c;
    hits += c.hits;
    total += c.total;
  }
  return { ...out, all: { hits, total } };
}

/**
 * Pinned after enabling the extra check on card-first. Increase = regression.
 * Detector and both runTurn paths must stay in lockstep (same extra check).
 */
const CARD_FIRST_NORMAL_FP: Record<string, SetCount> & { all: SetCount } = {
  "crisis-fp-harmless": { hits: 0, total: 24 },
  "crisis-fp-heldout-harmless": { hits: 0, total: 10 },
  "seed-normal": { hits: 0, total: 22 },
  paraphrase: { hits: 0, total: 24 },
  "review868-judged-non-crisis": { hits: 0, total: 172 },
  "review868-queries-non-pinned": { hits: 0, total: 849 },
  "retrieve-c450": { hits: 0, total: 123 },
  "retrieve-e948": { hits: 0, total: 148 },
  "retrieve-476b992": { hits: 0, total: 304 },
  "retrieve-routing-extra": { hits: 0, total: 32 },
  "retrieve-prep-price": { hits: 0, total: 70 },
  "retrieve-cross-topic-negatives": { hits: 0, total: 61 },
  all: { hits: 0, total: 1839 },
};

describe("extra-check false positives on every normal set, both paths", () => {
  it("detector counts match card-first runTurn and chat-first runTurn; pin card-first totals", async () => {
    const detector = scanAllDetector();
    const card = await scanAllPath(cardDeps());
    const chat = await scanAllPath(chatDeps());
    const detWithAll = {
      ...detector,
      all: Object.values(detector).reduce(
        (a, c) => ({ hits: a.hits + c.hits, total: a.total + c.total }),
        { hits: 0, total: 0 },
      ),
    };
    expect(card, "card-first vs detector").toEqual(detWithAll);
    expect(chat, "chat-first vs detector").toEqual(detWithAll);
    expect(card, "pinned card-first normal-set FP counts").toEqual(CARD_FIRST_NORMAL_FP);
  });
});
