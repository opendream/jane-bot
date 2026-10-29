import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import crisisFp from "../../evals/crisis-fp-set.json";
import seed from "../../evals/seed-set.json";
import paraphrase from "../../evals/paraphrase-set.json";
import judged from "../../evals/review868/judged.json";
import { detectChatCrisisForTurn, type ChatCrisisOutcome } from "../../src/core/chat-crisis";
import { BANK } from "../../src/core/bankData";
import { shippable } from "../../src/core/bank";
import { afterPick, AGE_REDIRECT_CARD } from "../../src/core/age";
import { retrieve } from "../../src/core/retrieve";
import { checkInput, REFUSAL_CARDS } from "../../src/core/guard";
import {
  detectCrisisRawOrFolded,
  FALLBACK_ID,
  WELCOME_ID,
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import { detectChatLang } from "../../src/llm/chat-lang";
import { ENGLISH_MODEL_CHAT } from "../../src/config";
import {
  ADVERSARIAL_CHAT_CRISIS_FP,
  ADVERSARIAL_CUE_MIX,
  CODEX_CITED_FP_LINES,
  CODEX_THAI_ONLY_CARD_LINES,
  ROUND4_PRECISION_CARD_LINES,
  ROUND5_AMBIGUOUS_LINES,
} from "./chat-crisis-adversarial-fp";

// SYNTHETIC eval/fixture texts only. Counts and ids; never user logs.

type Item = { id: string; text: string };
type SetCount = { hits: number; total: number };
type OutcomeCount = { clear: number; ambiguous: number; none: number; total: number };

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
    if (detectCrisisRawOrFolded(text).crisis) continue;
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

/** Extra-check FP: pin missed (raw or folded), extra check CLEAR. Ids only — never the text. */
function extraHit(text: string): boolean {
  if (detectCrisisRawOrFolded(text).crisis) return false;
  return detectChatCrisisForTurn(text, []).outcome === "clear";
}

function extraOutcome(text: string): ChatCrisisOutcome {
  if (detectCrisisRawOrFolded(text).crisis) return "none";
  return detectChatCrisisForTurn(text, []).outcome;
}

/** Overall turn: pin CLEAR, else the extra-check outcome. */
function turnOutcome(text: string): ChatCrisisOutcome {
  if (detectCrisisRawOrFolded(text).crisis) return "clear";
  return detectChatCrisisForTurn(text, []).outcome;
}

function scanOutcomes(items: Item[]): OutcomeCount {
  const out: OutcomeCount = { clear: 0, ambiguous: 0, none: 0, total: items.length };
  for (const x of items) {
    const o = extraOutcome(x.text);
    out[o] += 1;
  }
  return out;
}

function scanDetector(items: Item[]): SetCount {
  let hits = 0;
  for (const x of items) if (extraHit(x.text)) hits++;
  return { hits, total: items.length };
}

async function scanPath(items: Item[], deps: TurnDeps): Promise<SetCount> {
  let hits = 0;
  for (const x of items) {
    if (detectCrisisRawOrFolded(x.text).crisis) continue;
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

function englishItems(items: Item[]): Item[] {
  return items.filter((x) => detectChatLang(x.text) === "en");
}

function scanEnglishDetector(): Record<string, SetCount> {
  const out: Record<string, SetCount> = {};
  for (const s of normalSets()) out[s.name] = scanDetector(englishItems(s.items));
  return out;
}

async function scanEnglishPath(deps: TurnDeps): Promise<Record<string, SetCount> & { all: SetCount }> {
  const out: Record<string, SetCount> = {};
  let hits = 0;
  let total = 0;
  for (const s of normalSets()) {
    const c = await scanPath(englishItems(s.items), deps);
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

/**
 * Extra-check FPs among items detectChatLang classifies as English.
 * ENGLISH_MODEL_CHAT is false: English takes the no-model card path, but the
 * extra check still must not fire on these. Git normal sets are Thai SRH
 * evals: 0 items pass detectChatLang. Increase = regression. Detector and
 * both runTurn paths must stay in lockstep.
 */
const ENGLISH_NORMAL_FP: Record<string, SetCount> & { all: SetCount } = {
  "crisis-fp-harmless": { hits: 0, total: 0 },
  "crisis-fp-heldout-harmless": { hits: 0, total: 0 },
  "seed-normal": { hits: 0, total: 0 },
  paraphrase: { hits: 0, total: 0 },
  "review868-judged-non-crisis": { hits: 0, total: 0 },
  "review868-queries-non-pinned": { hits: 0, total: 0 },
  "retrieve-c450": { hits: 0, total: 0 },
  "retrieve-e948": { hits: 0, total: 0 },
  "retrieve-476b992": { hits: 0, total: 0 },
  "retrieve-routing-extra": { hits: 0, total: 0 },
  "retrieve-prep-price": { hits: 0, total: 0 },
  "retrieve-cross-topic-negatives": { hits: 0, total: 0 },
  all: { hits: 0, total: 0 },
};

/** SYNTHETIC English SRH questions (ids only in assertions). Git evals have none. */
const SYNTHETIC_ENGLISH_NORMAL: Item[] = [
  { id: "en-n01", text: "how does contraception work" },
  { id: "en-n02", text: "when should I take emergency contraception" },
  { id: "en-n03", text: "the condom broke what now" },
  { id: "en-n04", text: "where can I get an HIV test" },
  { id: "en-n05", text: "what is PrEP" },
  { id: "en-n06", text: "my period is late" },
  { id: "en-n07", text: "how do I talk about the relationship" },
  { id: "en-n08", text: "I want to know about birth control" },
  { id: "en-n09", text: "I don't want to live with my parents" },
  { id: "en-n10", text: "what is forced sex" },
];

/** SYNTHETIC English-normal lines that contain 'help' in ordinary SRH use. */
const SYNTHETIC_ENGLISH_HELP_NORMAL: Item[] = [
  { id: "en-h01", text: "help me choose a condom" },
  { id: "en-h02", text: "Can you help me with emergency contraception" },
  { id: "en-h03", text: "please help me understand PrEP" },
  { id: "en-h04", text: "I need help finding a clinic" },
];

const SYNTHETIC_ENGLISH_NORMAL_FP: SetCount = { hits: 0, total: 10 };

/**
 * SYNTHETIC English + mixed health questions that use die/cut/abuse/dead/forced/hurt
 * in ordinary SRH senses. Must not fire the extra check on either path.
 */
const SYNTHETIC_ENGLISH_MIXED_HEALTH: Item[] = [
  { id: "emh01", text: "does HIV die outside the body" },
  { id: "emh02", text: "condom cut" },
  { id: "emh03", text: "cut down on drinking before PrEP" },
  { id: "emh04", text: "drug abuse and HIV risk" },
  { id: "emh05", text: "condom got cut what to do" },
  { id: "emh06", text: "ถุงยาง cut ได้ไหม" },
  { id: "emh07", text: "เชื้อ HIV die นอกร่างกายไหม" },
  { id: "emh08", text: "can HIV die in air" },
  { id: "emh09", text: "PrEP cut dose" },
  { id: "emh10", text: "Do sperm die in water?" },
  { id: "emh11", text: "does the HIV virus die when it leaves the body" },
  { id: "emh12", text: "can condoms get cut by fingernails" },
  { id: "emh13", text: "what if the condom was cut" },
  { id: "emh14", text: "HIV die on surfaces" },
  { id: "emh15", text: "how long until HIV dies outside" },
  { id: "emh16", text: "cut the PrEP pill in half" },
  { id: "emh17", text: "alcohol abuse and PrEP" },
  { id: "emh18", text: "substance abuse HIV testing" },
  { id: "emh19", text: "does heat make HIV die" },
  { id: "emh20", text: "sperm die after ejaculation outside" },
  { id: "emh21", text: "does insertion hurt with a condom" },
  { id: "emh22", text: "why does sex hurt" },
  { id: "emh23", text: "first time sex hurt is that normal" },
  { id: "emh24", text: "forced choice between pill and IUD" },
  { id: "emh25", text: "is daily PrEP a forced schedule" },
  { id: "emh26", text: "dead virus in HIV vaccine" },
  { id: "emh27", text: "is the virus dead after soap" },
  { id: "emh28", text: "cut down sugar before blood test" },
  { id: "emh29", text: "ถุงยาง cut แล้วต้องทำไง" },
  { id: "emh30", text: "PrEP ต้อง cut ขนาดยาไหม" },
  { id: "emh31", text: "HIV die เมื่อเจออากาศไหม" },
  { id: "emh32", text: "can I cut down PrEP to four days" },
  { id: "emh33", text: "does HIV die in the dryer" },
  { id: "emh34", text: "condom packaging cut open with scissors" },
  { id: "emh35", text: "childhood vaccine uses dead virus not live" },
  { id: "emh36", text: "does lube make condoms cut more easily" },
  { id: "emh37", text: "hurt to pee after sex" },
  { id: "emh38", text: "how does drug abuse change HIV risk" },
  { id: "emh39", text: "do white blood cells die after HIV" },
  { id: "emh40", text: "cut a notch in the condom by accident" },
  { id: "emh41", text: "sperm die in the shower water" },
  { id: "emh42", text: "does soap make sperm die" },
  { id: "emh43", text: "cut calories before taking EC" },
  { id: "emh44", text: "partner said the condom cut during sex" },
  { id: "emh45", text: "forced daily dosing of PrEP vs on demand" },
  { id: "emh46", text: "I don't wanna die, is HIV curable" },
  { id: "emh47", text: "can birth control cause suicidal thoughts" },
  { id: "emh48", text: "can PrEP cause suicidal thoughts?" },
  { id: "emh49", text: "does the morning after pill cause suicidal thoughts" },
  { id: "emh50", text: "I cut my skin shaving down there, can I get HIV" },
  { id: "emh51", text: "I cut my legs shaving can I still have sex" },
  { id: "emh52", text: "the condom got cut" },
  { id: "emh53", text: "condom was cut" },
];

const SYNTHETIC_ENGLISH_MIXED_HEALTH_FP: SetCount = {
  hits: 0,
  total: SYNTHETIC_ENGLISH_MIXED_HEALTH.length,
};

function baseCardId(text: string): string {
  const g = checkInput(text);
  if (g) return REFUSAL_CARDS[g].id;
  const pool = BANK.filter((c) => shippable(c, "draft") && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
  const ranked = retrieve(text, pool, null).ranked;
  const top = ranked[0]?.card;
  if (!top) return FALLBACK_ID;
  return afterPick(top, "18-24", AGE_REDIRECT_CARD).id;
}

function spyModel() {
  const calls = { chat: 0, pick: 0, reword: 0 };
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async () => {
      calls.chat++;
      return "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";
    }),
    pickCard: vi.fn(async (_t, list) => {
      calls.pick++;
      return list[0]?.id ?? null;
    }),
    reword: vi.fn(async (card) => {
      calls.reword++;
      return card.answer_th;
    }),
  };
  return { model, calls };
}

const ADVERSARIAL_ITEMS: Item[] = ADVERSARIAL_CHAT_CRISIS_FP.map((text, i) => ({
  id: `adv-${String(i + 1).padStart(3, "0")}`,
  text,
}));

const ADVERSARIAL_FP: SetCount = { hits: 0, total: ADVERSARIAL_ITEMS.length };

describe("English extra-check false positives on every normal set (ENGLISH_MODEL_CHAT off)", () => {
  it("English-item detector matches card-first and chat-first; pin English totals", async () => {
    expect(ENGLISH_MODEL_CHAT).toBe(false);
    const detector = scanEnglishDetector();
    const card = await scanEnglishPath(cardDeps());
    const chat = await scanEnglishPath(chatDeps());
    const detWithAll = {
      ...detector,
      all: Object.values(detector).reduce(
        (a, c) => ({ hits: a.hits + c.hits, total: a.total + c.total }),
        { hits: 0, total: 0 },
      ),
    };
    expect(card, "English card-first vs detector").toEqual(detWithAll);
    expect(chat, "English chat-first vs detector").toEqual(detWithAll);
    expect(card, "pinned English normal-set FP counts").toEqual(ENGLISH_NORMAL_FP);

    expect(englishItems(SYNTHETIC_ENGLISH_NORMAL)).toHaveLength(SYNTHETIC_ENGLISH_NORMAL.length);
    const synDet = scanDetector(SYNTHETIC_ENGLISH_NORMAL);
    const synCard = await scanPath(SYNTHETIC_ENGLISH_NORMAL, cardDeps());
    const synChat = await scanPath(SYNTHETIC_ENGLISH_NORMAL, chatDeps());
    expect(synCard, "synthetic English card-first vs detector").toEqual(synDet);
    expect(synChat, "synthetic English chat-first vs detector").toEqual(synDet);
    expect(synCard, "pinned synthetic English-normal FP").toEqual(SYNTHETIC_ENGLISH_NORMAL_FP);

    expect(englishItems(SYNTHETIC_ENGLISH_HELP_NORMAL)).toHaveLength(SYNTHETIC_ENGLISH_HELP_NORMAL.length);
    const helpDet = scanDetector(SYNTHETIC_ENGLISH_HELP_NORMAL);
    const helpCard = await scanPath(SYNTHETIC_ENGLISH_HELP_NORMAL, cardDeps());
    const helpChat = await scanPath(SYNTHETIC_ENGLISH_HELP_NORMAL, chatDeps());
    expect(helpCard, "synthetic English-help card-first vs detector").toEqual(helpDet);
    expect(helpChat, "synthetic English-help chat-first vs detector").toEqual(helpDet);
    expect(helpCard, "pinned synthetic English-help-normal FP").toEqual({
      hits: 0,
      total: SYNTHETIC_ENGLISH_HELP_NORMAL.length,
    });

    expect(SYNTHETIC_ENGLISH_MIXED_HEALTH.length).toBeGreaterThanOrEqual(40);
    const healthDet = scanDetector(SYNTHETIC_ENGLISH_MIXED_HEALTH);
    const healthCard = await scanPath(SYNTHETIC_ENGLISH_MIXED_HEALTH, cardDeps());
    const healthChat = await scanPath(SYNTHETIC_ENGLISH_MIXED_HEALTH, chatDeps());
    expect(healthCard, "synthetic English/mixed health card-first vs detector").toEqual(healthDet);
    expect(healthChat, "synthetic English/mixed health chat-first vs detector").toEqual(healthDet);
    expect(healthCard, "pinned synthetic English/mixed health FP").toEqual(SYNTHETIC_ENGLISH_MIXED_HEALTH_FP);

    expect(ADVERSARIAL_ITEMS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(ADVERSARIAL_CHAT_CRISIS_FP).size).toBe(ADVERSARIAL_CHAT_CRISIS_FP.length);
    expect(CODEX_CITED_FP_LINES).toHaveLength(11);
    expect(CODEX_THAI_ONLY_CARD_LINES.length).toBeGreaterThanOrEqual(14);
    expect(ROUND4_PRECISION_CARD_LINES.length).toBeGreaterThanOrEqual(41);
    expect(ROUND5_AMBIGUOUS_LINES.length).toBeGreaterThanOrEqual(8);
    for (const line of [...CODEX_CITED_FP_LINES, ...CODEX_THAI_ONLY_CARD_LINES, ...ROUND4_PRECISION_CARD_LINES, ...ROUND5_AMBIGUOUS_LINES]) {
      expect(ADVERSARIAL_CHAT_CRISIS_FP, line).toContain(line);
    }
    const advDet = scanDetector(ADVERSARIAL_ITEMS);
    const advCard = await scanPath(ADVERSARIAL_ITEMS, cardDeps());
    const advChat = await scanPath(ADVERSARIAL_ITEMS, chatDeps());
    expect(advCard, "adversarial card-first vs detector").toEqual(advDet);
    expect(advChat, "adversarial chat-first vs detector").toEqual(advDet);
    expect(advCard, "pinned adversarial extra-check FP").toEqual(ADVERSARIAL_FP);
  });
});

describe("adversarial FP set keeps base card-first ids; no crisis on either path", () => {
  it("each line matches the retrieve base card and never opens crisis", async () => {
    const { model, calls } = spyModel();
    for (const x of ADVERSARIAL_ITEMS) {
      expect(detectCrisisRawOrFolded(x.text).crisis, x.id).toBe(false);
      const beforeCard = calls.chat + calls.pick + calls.reword;
      const card = await runTurn(newDialog("18-24"), x.text, { cards: BANK, copyStatus: "draft", model });
      expect(card.reply.kind, x.id).toBe("card");
      if (card.reply.kind === "card") {
        expect(card.reply.card.id, x.id).toBe(baseCardId(x.text));
      }
      expect(typeof beforeCard).toBe("number");

      const beforeChat = calls.chat + calls.pick + calls.reword;
      const chat = await runTurn(newDialog("18-24"), x.text, {
        cards: BANK, copyStatus: "draft", model, chatFirst: true,
      });
      expect(chat.reply.kind, x.id).not.toBe("crisis");
      expect(typeof beforeChat).toBe("number");
    }
  });
});

const GIT_EXTRA_OUTCOMES: OutcomeCount = { clear: 0, ambiguous: 0, none: 1839, total: 1839 };
const ADVERSARIAL_EXTRA_OUTCOMES: OutcomeCount = { clear: 0, ambiguous: 58, none: 227, total: 285 };
const CUE_MIX_OUTCOMES: OutcomeCount = { clear: 51, ambiguous: 8, none: 0, total: 59 };

async function scanPathOutcomes(items: Item[], deps: TurnDeps): Promise<OutcomeCount> {
  const out: OutcomeCount = { clear: 0, ambiguous: 0, none: 0, total: items.length };
  for (const x of items) {
    if (detectCrisisRawOrFolded(x.text).crisis) {
      out.none += 1;
      continue;
    }
    const r = await runTurn(newDialog(), x.text, deps);
    if (r.reply.kind === "crisis") out.clear += 1;
    else if ((r.reply.kind === "card" || r.reply.kind === "chat" || r.reply.kind === "referral") && r.reply.softCrisis) {
      out.ambiguous += 1;
    } else out.none += 1;
  }
  return out;
}

describe("extra-check three-way outcomes on FP corpora (pin-miss only)", () => {
  it("git normal sets are 0 CLEAR / 0 AMBIGUOUS / all NONE, both paths", async () => {
    const git = scanOutcomes(normalSets().flatMap((s) => s.items));
    expect(git, "pinned git extra-check outcomes").toEqual(GIT_EXTRA_OUTCOMES);

    const benign = scanOutcomes(SYNTHETIC_ENGLISH_NORMAL.concat(SYNTHETIC_ENGLISH_HELP_NORMAL));
    expect(benign).toEqual({
      clear: 0,
      ambiguous: 0,
      none: SYNTHETIC_ENGLISH_NORMAL.length + SYNTHETIC_ENGLISH_HELP_NORMAL.length,
      total: SYNTHETIC_ENGLISH_NORMAL.length + SYNTHETIC_ENGLISH_HELP_NORMAL.length,
    });

    const card = await scanPathOutcomes(normalSets().flatMap((s) => s.items), cardDeps());
    const chat = await scanPathOutcomes(normalSets().flatMap((s) => s.items), chatDeps());
    expect(card, "git card-first vs detector").toEqual(git);
    expect(chat, "git chat-first vs detector").toEqual(git);
  });

  it("adversarial FP set is 0 CLEAR; precision-guard and round-5 remaining FPs are AMBIGUOUS, both paths", async () => {
    const adv = scanOutcomes(ADVERSARIAL_ITEMS);
    expect(adv, "pinned adversarial extra-check outcomes").toEqual(ADVERSARIAL_EXTRA_OUTCOMES);
    expect(ROUND4_PRECISION_CARD_LINES.length).toBe(44);
    expect(ROUND5_AMBIGUOUS_LINES.length).toBe(8);

    for (const text of [...ROUND4_PRECISION_CARD_LINES, ...ROUND5_AMBIGUOUS_LINES]) {
      expect(extraOutcome(text), text).toBe("ambiguous");
    }

    const card = await scanPathOutcomes(ADVERSARIAL_ITEMS, cardDeps());
    const chat = await scanPathOutcomes(ADVERSARIAL_ITEMS, chatDeps());
    expect(card, "adversarial card-first vs detector").toEqual(adv);
    expect(chat, "adversarial chat-first vs detector").toEqual(adv);
  });

  it("adversarial cue mix has 0 NONE", () => {
    const mix: OutcomeCount = { clear: 0, ambiguous: 0, none: 0, total: ADVERSARIAL_CUE_MIX.length };
    for (const text of ADVERSARIAL_CUE_MIX) mix[turnOutcome(text)] += 1;
    expect(mix, "pinned cue-mix outcomes").toEqual(CUE_MIX_OUTCOMES);
  });
});
