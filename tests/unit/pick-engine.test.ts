import { describe, it, expect } from "vitest";
import fpSet from "../../evals/crisis-fp-set.json";
import prepPriceFile from "../fixtures/retrieve-prep-price.json";
import { CHAT_FIRST, MODEL_CARD_PICK } from "../../src/config";
import {
  FALLBACK_ID,
  MODEL_INPUT_CHARS,
  newDialog,
  runTurn,
  welcome,
  type DialogState,
  type TurnDeps,
  type TurnReply,
} from "../../src/core/dialog";
import { LOCKED_ROUTE_IDS, MODEL_PICK_TIMEOUT_MS, MODEL_PICK_TOP_N, type CardPicker } from "../../src/core/pick-engine";
import { shouldForceRulesFallback } from "../../src/core/pick-guards";
import { retrieve } from "../../src/core/retrieve";
import { shippable } from "../../src/core/bank";
import { BANK, BANK_FIXTURES } from "../../src/core/bankData";
import { NONE_ID, PICK_MAX_TOKENS, PICK_SYSTEM, pickSchema } from "../../src/llm/prompts";

// All chat text in these tests is SYNTHETIC, written for the tests.

const ADULT_ID = "other.adult_only.000";
const UNDER18_HIV = "hiv.test.under18.000";
const PREP_PRICE = "price.trc.prep.000";
const PREP_GENERAL = "protection.prep.000";
const adultFixture = BANK_FIXTURES.find((c) => c.id === ADULT_ID)!;

const UNDER18_HIV_QUESTIONS = [
  "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
  "เด็กตรวจเอชไอวีได้ไหม",
  "อยากตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
  "วัยรุ่นตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
  "เด็กตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
];

const LOCKED_BANK_ID = (id: string) =>
  id === "hiv.test.under18.000" || id.startsWith("price.trc.prep.") || id.startsWith("ec.timing.") || id === "urgent.pills.000";

function pool(cards = BANK) {
  return cards.filter((c) => shippable(c, "reviewed") && c.id !== FALLBACK_ID && c.id !== "general.welcome.000");
}
function shortlistIds(q: string, cards = BANK, topic: DialogState["topic"] = null) {
  return retrieve(q, pool(cards), topic).ranked.slice(0, MODEL_PICK_TOP_N).map((s) => s.card.id);
}
function rulesTop(q: string, cards = BANK) {
  return retrieve(q, pool(cards)).ranked[0]?.card.id ?? FALLBACK_ID;
}

type StubOpts = { delayMs?: number; ready?: boolean; warmupRemainingMs?: number | null; throwError?: boolean };
function stubPicker(raw: string | ((ids: string[]) => string), opts: StubOpts = {}) {
  const calls = { pick: 0, lastText: "", lastIds: [] as string[], lastFacts: [] as (string | undefined)[] };
  const picker: CardPicker = {
    ready: () => opts.ready !== false,
    warmupRemainingMs: opts.warmupRemainingMs === undefined ? undefined : () => opts.warmupRemainingMs ?? null,
    pick: async (text, shortlist, _prev, signal) => {
      calls.pick++;
      calls.lastText = text;
      calls.lastIds = shortlist.map((s) => s.id);
      calls.lastFacts = shortlist.map((s) => s.key_fact);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (signal.aborted) throw new Error("aborted");
      if (opts.throwError) throw new Error("runtime");
      return typeof raw === "function" ? raw(shortlist.map((s) => s.id)) : raw;
    },
  };
  return { picker, calls };
}

const pickDeps = (picker: CardPicker | null, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: extra.cards ?? BANK,
  model: extra.model ?? null,
  copyStatus: extra.copyStatus ?? "reviewed",
  modelPick: true,
  cardPicker: picker,
  pickTimeoutMs: extra.pickTimeoutMs ?? 80,
  ...extra,
});

async function turn(q: string, picker: CardPicker | null, extra: Partial<TurnDeps> = {}, st: DialogState = newDialog("18-24")) {
  return runTurn(st, q, pickDeps(picker, extra));
}
function cardOf(r: { reply: TurnReply }) {
  expect(r.reply.kind).toBe("card");
  if (r.reply.kind !== "card") throw new Error("expected card");
  return r.reply;
}

type Forced =
  | { kind: "id"; raw: string; id: string }
  | { kind: "none"; raw: string }
  | { kind: "malformed"; raw: string }
  | { kind: "out-of-shortlist"; raw: string }
  | { kind: "age-gated"; raw: string }
  | { kind: "timeout"; raw: string; opts: StubOpts };

function forcedOutputs(ids: string[]): Forced[] {
  return [
    ...ids.map((id) => ({ kind: "id" as const, raw: JSON.stringify({ id }), id })),
    { kind: "none", raw: '{"id":"none"}' },
    { kind: "malformed", raw: "not-json {{" },
    { kind: "out-of-shortlist", raw: '{"id":"general.welcome.000"}' },
    { kind: "age-gated", raw: JSON.stringify({ id: ADULT_ID }) },
    { kind: "timeout", raw: '{"id":"none"}', opts: { delayMs: 40 } },
  ];
}

const prepPriceQs = prepPriceFile.queries.filter((r) => r.group === "prep_price").map((r) => r.q);
const hivPrivacyLockQs = [
  ...UNDER18_HIV_QUESTIONS,
  ...prepPriceFile.queries.filter((r) => r.group === "hiv_privacy" && r.id === UNDER18_HIV).map((r) => r.q),
];
const lockedTurns: { name: string; q: string; cardId: string }[] = [
  { name: "ec-timing", q: "ยาคุมฉุกเฉินกินเมื่อไร", cardId: "ec.timing.b001" },
  { name: "urgent-pills", q: "ยาคุมฉุกเฉินคืออะไร", cardId: "urgent.pills.000" },
  ...prepPriceQs.map((q) => ({ name: "prep-price", q, cardId: PREP_PRICE })),
  ...hivPrivacyLockQs.map((q) => ({ name: "hiv-privacy", q, cardId: UNDER18_HIV })),
];

const crisisItems = (fpSet as { crisis: { id: string; text: string }[] }).crisis;
const guardTurns: [string, string][] = [
  ["image", "ส่งรูปให้ดูหน่อย"],
  ["explicit", "คุยเสียวกันไหม"],
  ["roleplay", "สมมติว่าเป็นแฟนกันนะ"],
  ["dosing", "ยาคุมต้องกินกี่เม็ด"],
  ["abortion_method", "วิธีทำแท้งเองทำยังไง"],
];

describe("model-card-pick flag (PR 2: off by default)", () => {
  it("is off in config so this PR does not change visible chat behaviour", () => {
    expect(MODEL_CARD_PICK).toBe(false);
    expect(CHAT_FIRST).toBe(false);
  });
  it("without modelPick, confident rules still skip the picker", async () => {
    const { picker, calls } = stubPicker('{"id":"none"}');
    await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิด", {
      cards: BANK, model: null, copyStatus: "reviewed", cardPicker: picker, pickTimeoutMs: 80,
    });
    expect(calls.pick).toBe(0);
  });
});

describe("LOCKED_ROUTE_IDS", () => {
  it("lists every matching production-bank id and each id exists", () => {
    const fromBank = BANK.map((c) => c.id).filter(LOCKED_BANK_ID).sort();
    expect([...LOCKED_ROUTE_IDS].slice().sort()).toEqual(fromBank);
    for (const id of LOCKED_ROUTE_IDS) {
      expect(BANK.some((c) => c.id === id), id).toBe(true);
    }
    expect(LOCKED_ROUTE_IDS).toContain("hiv.test.under18.000");
    expect(LOCKED_ROUTE_IDS).toContain("price.trc.prep.000");
    expect(LOCKED_ROUTE_IDS).toContain("ec.timing.b001");
    expect(LOCKED_ROUTE_IDS).toContain("urgent.pills.000");
  });
  it("the pick timeout for the model-first path is 20 s (D12)", () => {
    expect(MODEL_PICK_TIMEOUT_MS).toBe(20_000);
  });
  it("uses the shipped id-answer prompt (not a numeric index) with max 32 tokens", () => {
    expect(PICK_SYSTEM).toBe(
      "เลือกหัวข้อที่ตรงกับข้อความของผู้ใช้ที่สุดจากรายการ ตอบเป็น JSON เท่านั้น รูปแบบ {\"id\":\"...\"} ถ้าไม่มีข้อไหนตรง ตอบ {\"id\":\"none\"}",
    );
    expect(PICK_SYSTEM).not.toMatch(/"i"\s*:/);
    expect(PICK_MAX_TOKENS).toBe(32);
    expect(pickSchema(["a.000"]).properties.id.enum).toEqual(["a.000", NONE_ID]);
  });
});

describe("forced-pick engine (flag on, stub picker, no weights)", () => {
  it("locked routes (every locked id, #34, #35) ignore every stub output and make 0 model calls", async () => {
    expect(lockedTurns.length).toBeGreaterThan(10);
    for (const t of lockedTurns) {
      expect(rulesTop(t.q), t.q).toBe(t.cardId);
      const ids = shortlistIds(t.q);
      for (const out of forcedOutputs(ids)) {
        const { picker, calls } = stubPicker(out.raw, out.kind === "timeout" ? out.opts : {});
        const r = await turn(t.q, picker, { pickTimeoutMs: 10 });
        const c = cardOf(r);
        expect(calls.pick, `${t.q} ${out.kind}`).toBe(0);
        expect(c.card.id, `${t.q} ${out.kind}`).toBe(t.cardId);
        expect(c.engine, `${t.q} ${out.kind}`).toBe("rules-locked");
        expect(c.text).toBe(c.card.answer_th);
      }
    }
  });

  it("crisis items make 0 model calls and tag rules-crisis", async () => {
    expect(crisisItems.length).toBeGreaterThan(0);
    for (const item of crisisItems) {
      for (const out of forcedOutputs(["ec.timing.b001"])) {
        const { picker, calls } = stubPicker(out.raw, out.kind === "timeout" ? out.opts : {});
        const r = await turn(item.text, picker, { pickTimeoutMs: 10 });
        expect(r.reply.kind, item.id).toBe("crisis");
        expect(calls.pick, `${item.id} ${out.kind}`).toBe(0);
        if (r.reply.kind === "crisis") expect(r.reply.engine).toBe("rules-crisis");
      }
    }
  });

  it("guard turns make 0 model calls and tag rules-guard", async () => {
    for (const [reason, q] of guardTurns) {
      for (const out of forcedOutputs(["ec.timing.b001"])) {
        const { picker, calls } = stubPicker(out.raw, out.kind === "timeout" ? out.opts : {});
        const r = await turn(q, picker, { pickTimeoutMs: 10 });
        const c = cardOf(r);
        expect(calls.pick, `${reason} ${out.kind}`).toBe(0);
        expect(c.via).toBe("guard");
        expect(c.engine).toBe("rules-guard");
        expect(c.guard).toBe(reason);
      }
    }
  });

  it("chip turns make 0 model calls and tag rules-chip", async () => {
    const w = welcome(newDialog("15-17"), BANK);
    expect(w.state.pendingChips.some((c) => c.label_th === "กังวลเรื่องท้อง")).toBe(true);
    for (const out of forcedOutputs(["pregnancy.ornot.000"])) {
      const { picker, calls } = stubPicker(out.raw, out.kind === "timeout" ? out.opts : {});
      const r = await runTurn(w.state, "กังวลเรื่องท้อง", pickDeps(picker, { pickTimeoutMs: 10 }));
      const c = cardOf(r);
      expect(calls.pick, out.kind).toBe(0);
      expect(c.via).toBe("followup");
      expect(c.engine).toBe("rules-chip");
      expect(c.card.id).toBe("pregnancy.ornot.000");
    }
  });

  const freeText: { name: string; q: string; age?: DialogState["ageBand"] }[] = [
    { name: "unsure", q: "กลัวจะท้อง เพราะถุงยางรั่ว" },
    { name: "confident-d4", q: "อยากรู้เรื่องคุมกำเนิด" },
    { name: "prep-general", q: "PrEP คืออะไร" },
    { name: "adult-hiv-privacy", q: "อยากตรวจเอชไอวีโดยไม่บอกแฟน" },
    { name: "teen-prep-not-34", q: "กินเพร็พโดยไม่บอกผู้ปกครองได้ไหม" },
  ];

  it("free-text turns (incl. rules-confident D4) call the model with top-3 ids and honour every stub output", async () => {
    for (const t of freeText) {
      expect(LOCKED_ROUTE_IDS.includes(rulesTop(t.q) as typeof LOCKED_ROUTE_IDS[number]), t.q).toBe(false);
      const ids = shortlistIds(t.q);
      expect(ids.length, t.q).toBeGreaterThan(0);
      expect(ids.length, t.q).toBeLessThanOrEqual(MODEL_PICK_TOP_N);
      const rulesCard = rulesTop(t.q);
      for (const out of forcedOutputs(ids)) {
        const { picker, calls } = stubPicker(out.raw, out.kind === "timeout" ? { delayMs: 40 } : {});
        const r = await turn(t.q, picker, { pickTimeoutMs: 10 });
        const c = cardOf(r);
        expect(calls.pick, `${t.name} ${out.kind}`).toBe(1);
        expect(calls.lastIds.length).toBeLessThanOrEqual(MODEL_PICK_TOP_N);
        if (out.kind === "id") {
          const ranked = retrieve(t.q, pool());
          const force = shouldForceRulesFallback(rulesCard, out.id);
          if (ranked.confident && out.id !== rulesCard) {
            expect(c.card.id, `${t.name} ${out.id}`).toBe(rulesCard);
            expect(c.engine).toBe("rules-fallback");
            expect(c.engineReason).toBe("confident-agree");
          } else if (force) {
            expect(c.card.id, `${t.name} ${out.id}`).toBe(rulesCard);
            expect(c.engine).toBe("rules-fallback");
            expect(c.engineReason).toBe("post-check");
          } else {
            expect(c.card.id, `${t.name} ${out.id}`).toBe(out.id);
            expect(c.engine).toBe("model");
            expect(c.via).toBe("model");
          }
        } else {
          expect(c.card.id, `${t.name} ${out.kind}`).toBe(rulesCard);
          expect(c.engine, `${t.name} ${out.kind}`).toBe("rules-fallback");
          const reason = out.kind === "timeout" ? "timeout"
            : out.kind === "none" ? "none"
            : out.kind === "malformed" ? "malformed"
            : "out-of-shortlist";
          expect(c.engineReason, `${t.name} ${out.kind}`).toBe(reason);
        }
        expect(c.text).toBe(c.card.answer_th);
      }
    }
  });

  it("no-candidates turns keep the rules fallback, skip the model, and record no-candidates", async () => {
    const q = "วันนี้อากาศดีจัง";
    expect(retrieve(q, pool()).ranked).toHaveLength(0);
    for (const out of forcedOutputs([])) {
      const { picker, calls } = stubPicker(out.raw, out.kind === "timeout" ? out.opts : {});
      const r = await turn(q, picker, { pickTimeoutMs: 10 });
      const c = cardOf(r);
      expect(calls.pick, out.kind).toBe(0);
      expect(c.card.id).toBe(FALLBACK_ID);
      expect(c.engine).toBe("rules-fallback");
      expect(c.engineReason).toBe("no-candidates");
    }
  });

  it("an age-gated shortlist id falls back for under-18 bands and is accepted for adult bands", async () => {
    const seed = BANK.find((c) => c.id === "birth.control.000")!;
    const adult = { ...adultFixture, triggers: seed.triggers, id: ADULT_ID };
    const cards = [...BANK, adult];
    const q = "อยากรู้เรื่องคุมกำเนิด";
    const ids = shortlistIds(q, cards);
    expect(ids).toContain(ADULT_ID);
    expect(ids).toContain("birth.control.000");
    for (const band of ["15-17", "unspecified", null] as const) {
      const { picker, calls } = stubPicker(JSON.stringify({ id: ADULT_ID }));
      const r = await runTurn(newDialog(band), q, pickDeps(picker, { cards }));
      const c = cardOf(r);
      expect(calls.pick, String(band)).toBe(1);
      expect(c.card.id, String(band)).toBe("birth.control.000");
      expect(c.engine).toBe("rules-fallback");
      expect(c.engineReason).toBe("age-gated");
    }
    for (const band of ["18-24", "25+"] as const) {
      const { picker, calls } = stubPicker(JSON.stringify({ id: ADULT_ID }));
      const r = await runTurn(newDialog(band), q, pickDeps(picker, { cards }));
      const c = cardOf(r);
      expect(calls.pick, band).toBe(1);
      const ranked = retrieve(q, pool(cards));
      if (ranked.confident && ranked.ranked[0]?.card.id !== ADULT_ID) {
        expect(c.card.id, band).toBe(ranked.ranked[0].card.id);
        expect(c.engine).toBe("rules-fallback");
        expect(c.engineReason).toBe("confident-agree");
      } else {
        expect(c.card.id, band).toBe(ADULT_ID);
        expect(c.engine).toBe("model");
      }
    }
  });

  it("a locked card is only an override from a non-locked route when it was shortlisted", async () => {
    const q = "กินเพร็พโดยไม่บอกผู้ปกครองได้ไหม";
    expect(rulesTop(q)).toBe(PREP_GENERAL);
    const ids = shortlistIds(q);
    const { picker: inList, calls: inCalls } = stubPicker(JSON.stringify({ id: ids[0] }));
    const ok = cardOf(await turn(q, inList));
    expect(inCalls.pick).toBe(1);
    expect(ok.card.id).toBe(ids[0]);
    expect(ok.engine).toBe("model");

    const { picker: lockedOos, calls: oosCalls } = stubPicker(JSON.stringify({ id: UNDER18_HIV }));
    const blocked = cardOf(await turn(q, lockedOos));
    expect(oosCalls.pick).toBe(1);
    if (ids.includes(UNDER18_HIV)) {
      expect(blocked.card.id).toBe(UNDER18_HIV);
      expect(blocked.engine).toBe("model");
    } else {
      expect(blocked.card.id).not.toBe(UNDER18_HIV);
      expect(blocked.engine).toBe("rules-fallback");
      expect(blocked.engineReason).toBe("out-of-shortlist");
    }
  });

  it("never moves an under-18 HIV-privacy turn off hiv.test.under18.000", async () => {
    for (const q of UNDER18_HIV_QUESTIONS) {
      const ids = shortlistIds(q);
      const other = ids.find((id) => id !== UNDER18_HIV) ?? PREP_GENERAL;
      const { picker, calls } = stubPicker(JSON.stringify({ id: other }));
      const r = await runTurn(newDialog("15-17"), q, pickDeps(picker));
      const c = cardOf(r);
      expect(calls.pick, q).toBe(0);
      expect(c.card.id, q).toBe(UNDER18_HIV);
      expect(c.engine, q).toBe("rules-locked");
    }
  });

  it("runtime error and unknown id fall back to the rules answer", async () => {
    const q = "กลัวจะท้อง เพราะถุงยางรั่ว";
    const rulesCard = rulesTop(q);
    const boom = stubPicker("{}", { throwError: true });
    const err = cardOf(await turn(q, boom.picker));
    expect(boom.calls.pick).toBe(1);
    expect(err.card.id).toBe(rulesCard);
    expect(err.engine).toBe("rules-fallback");
    expect(err.engineReason).toBe("runtime-error");

    const unknown = stubPicker('{"id":"not.a.card.000"}');
    const miss = cardOf(await turn(q, unknown.picker));
    expect(unknown.calls.pick).toBe(1);
    expect(miss.card.id).toBe(rulesCard);
    expect(miss.engine).toBe("rules-fallback");
    expect(miss.engineReason).toBe("out-of-shortlist");
  });

  it("not-ready with warmup remaining > 5 s is rules-not-ready without waiting", async () => {
    const q = "อยากรู้เรื่องคุมกำเนิด";
    const { picker, calls } = stubPicker(JSON.stringify({ id: "birth.control.000" }), {
      ready: false, warmupRemainingMs: 8000,
    });
    const t0 = Date.now();
    const r = cardOf(await turn(q, picker, { pickTimeoutMs: 200 }));
    expect(Date.now() - t0).toBeLessThan(100);
    expect(calls.pick).toBe(0);
    expect(r.card.id).toBe("birth.control.000");
    expect(r.engine).toBe("rules-not-ready");
  });

  it("not-ready outside final warmup is rules-not-ready with no model call", async () => {
    const q = "อยากรู้เรื่องคุมกำเนิด";
    const { picker, calls } = stubPicker(JSON.stringify({ id: "birth.control.000" }), { ready: false });
    const r = cardOf(await turn(q, picker));
    expect(calls.pick).toBe(0);
    expect(r.engine).toBe("rules-not-ready");
    expect(r.card.id).toBe("birth.control.000");
  });

  it("final warmup with <= ~5 s remaining waits within the 20 s budget then picks", async () => {
    const q = "อยากรู้เรื่องคุมกำเนิด";
    let ready = false;
    const calls = { pick: 0 };
    const picker: CardPicker = {
      ready: () => ready,
      warmupRemainingMs: () => (ready ? null : 40),
      pick: async () => {
        calls.pick++;
        return JSON.stringify({ id: "birth.control.000" });
      },
    };
    setTimeout(() => { ready = true; }, 20);
    const r = cardOf(await turn(q, picker, { pickTimeoutMs: 400 }));
    expect(calls.pick).toBe(1);
    expect(r.card.id).toBe("birth.control.000");
    expect(r.engine).toBe("model");
  });

  it("loader extraEta > 5 s is rules-not-ready even when the picker omits warmupRemainingMs", async () => {
    const q = "อยากรู้เรื่องคุมกำเนิด";
    const { picker, calls } = stubPicker(JSON.stringify({ id: "birth.control.000" }), { ready: false });
    const t0 = Date.now();
    const r = cardOf(await turn(q, picker, { pickTimeoutMs: 200, warmupRemainingMs: () => 8000 }));
    expect(Date.now() - t0).toBeLessThan(100);
    expect(calls.pick).toBe(0);
    expect(r.engine).toBe("rules-not-ready");
    expect(r.card.id).toBe("birth.control.000");
  });

  it("loader extraEta ≤ 5 s waits then picks when the picker omits warmupRemainingMs", async () => {
    const q = "อยากรู้เรื่องคุมกำเนิด";
    let ready = false;
    const calls = { pick: 0 };
    const picker: CardPicker = {
      ready: () => ready,
      pick: async () => {
        calls.pick++;
        return JSON.stringify({ id: "birth.control.000" });
      },
    };
    setTimeout(() => { ready = true; }, 20);
    const r = cardOf(await turn(q, picker, { pickTimeoutMs: 400, warmupRemainingMs: () => (ready ? null : 40) }));
    expect(calls.pick).toBe(1);
    expect(r.card.id).toBe("birth.control.000");
    expect(r.engine).toBe("model");
  });

  it("V3 shortlist includes the first reviewed key_fact and confident disagreement is rules-fallback", async () => {
    const q = "อยากรู้เรื่องคุมกำเนิด";
    expect(retrieve(q, pool()).confident).toBe(true);
    const ids = shortlistIds(q);
    const other = ids.find((id) => id !== "birth.control.000") ?? ids[1];
    expect(other).toBeTruthy();
    const { picker, calls } = stubPicker(JSON.stringify({ id: other }));
    const r = cardOf(await turn(q, picker));
    expect(calls.pick).toBe(1);
    expect(calls.lastFacts.some(Boolean)).toBe(true);
    expect(r.card.id).toBe("birth.control.000");
    expect(r.engine).toBe("rules-fallback");
    expect(r.engineReason).toBe("confident-agree");
  });

  it("the picker only sees PII-stripped, clipped text and never generates the shown answer", async () => {
    const q = `กลัวจะท้อง เพราะถุงยางรั่ว โทร 081-234-5678 ${"ก".repeat(300)}`;
    const { picker, calls } = stubPicker((ids) => JSON.stringify({ id: ids[0] }));
    const r = cardOf(await turn(q, picker));
    expect(calls.lastText).not.toContain("081");
    expect(calls.lastText.length).toBeLessThanOrEqual(MODEL_INPUT_CHARS);
    expect(r.text).toBe(r.card.answer_th);
    expect(r.reworded).toBe(false);
  });
});
