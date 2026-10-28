import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { shippable, type BankCard, type BankTopic } from "../../src/core/bank";
import { countTriggerHits, retrieve } from "../../src/core/retrieve";
import { FALLBACK_ID, WELCOME_ID, runTurn, newDialog, type TurnDeps } from "../../src/core/dialog";
import baselineFile from "../fixtures/retrieve-c450-baseline.json";
import extraFile from "../fixtures/retrieve-routing-extra.json";
import e948File from "../fixtures/retrieve-e948-baseline.json";
import crossTopicNegatives from "../fixtures/retrieve-cross-topic-negatives.json";
import frozen476File from "../fixtures/retrieve-476b992-baseline.json";
import prepPriceFile from "../fixtures/retrieve-prep-price.json";

// All queries here are SYNTHETIC, written for these tests.

const deps = (): TurnDeps => ({ cards: BANK, model: null, copyStatus: "reviewed" });
const pool = BANK.filter((c) => shippable(c, "reviewed") && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
const topId = (q: string) => retrieve(q, pool).ranked[0]?.card.id;
const row = (owner: string, trigger: string, top: string) => `${owner}\t${trigger}\t${top}`;

function triggerMisroutes(): string[] {
  const out: string[] = [];
  for (const card of BANK) {
    if (card.review.status !== "approved" || !card.triggers.length) continue;
    if (card.id === FALLBACK_ID || card.id === WELCOME_ID) continue;
    for (const trigger of card.triggers) {
      const top = topId(trigger) ?? "(none)";
      if (top !== card.id) out.push(row(card.id, trigger, top));
    }
  }
  return out;
}

/**
 * Distinctive overlapping fragments so a card's own trigger outranks a
 * sibling stem via the listed-match tie-break. Frozen 123/e948 tables stay
 * the old query set; these strings are new. Each one must carry that card's
 * topic word — the list is not a silent exemption.
 */
const NEW_OWN_TRIGGER_FRAGMENTS = [
  "ตรวจเอชไอวี โดยไม่บอกผู้ปกครอง",
  "ตรวจ เอชไอวีโดยไม่บอกผู้ปกครอง",
  "เด็กตรวจเอชไอวี",
  "เด็กตรวจ เอชไอวี",
  "วิธีใช้ ถุงยาง",
  "ยาคุม รายเดือน",
  "กิน ยาคุมยังไง",
  "คุม 21 เม็ด",
  "ฝังยา คุม",
  "สงสัยว่าติด หนองใน",
  "เป็น หนองใน",
  "เริม รักษาหาย",
  "เริม หายขาด",
  "อาการ ซิฟิลิส",
  "แผล ซิฟิลิส",
  "ราคา เพร็พ",
  "เพร็พ กี่บาท",
  "เพร็พราคา",
  "เพร็พ ราคา",
  "ยาเพร็พราคา",
  "ยาเพร็พ ราคา",
  "ยาเพร็พกี่บาท",
  "ยาเพร็พ กี่บาท",
  "เพร็พแพง",
  "เพร็พ แพง",
  "ยาเพร็พแพง",
  "ยาเพร็พ แพง",
  "ค่ายาเพร็พ",
  "ค่ายา เพร็พ",
  "ค่า ยาเพร็พ",
  "ค่า ยา เพร็พ",
  "prepราคา",
  "prep ราคา",
  "ราคาprep",
  "ราคา prep",
  "prepกี่บาท",
  "prep กี่บาท",
  "prepแพง",
  "prep แพง",
  "ค่ายาprep",
  "ค่ายา prep",
];

/** Topic term a new fragment on that owner must carry. */
const OWNER_TOPIC_TERM: Record<string, RegExp> = {
  "hiv.test.under18.000": /เอชไอวี|hiv/i,
  "price.trc.prep.000": /เพร็พ|prep/i,
  "disease.gonorrhea.001": /หนองใน/,
  "birth.control.pills.000": /ยาคุม|รายเดือน|21\s*เม็ด/,
  "condom.how_to.000": /ถุงยาง/,
  "birth.control.implant.000": /ฝังยา/,
  "disease.herpes.002": /เริม/,
  "disease.syphilis.001": /ซิฟิลิส/,
};

function stubCard(id: string, triggers: string[], topic: BankTopic = "emergency_contraception"): BankCard {
  return {
    id, topic, title_th: id, answer_th: "x", key_facts: [], triggers,
    next: [], source_intents: [], source: [],
    review: { status: "approved", reviewer: "t", reviewed_on: "2026-10-27" },
    last_reviewed: "2026-10-27", flags: [], referral: { offer: "none", intents: [] },
    links: [], age_min: 15, reword: false, licence: "CC-BY-SA-4.0",
  };
}

describe("trigger matches count once per card", () => {
  it("a whitespace-twin trigger pair scores the same as a single trigger", () => {
    const q = "กินยาคุมฉุกเฉิน";
    const pair = ["กินยาคุมฉุกเฉิน", "กิน ยาคุมฉุกเฉิน"];
    const one = ["กินยาคุมฉุกเฉิน"];
    expect(countTriggerHits(q, pair)).toBe(countTriggerHits(q, one));
    expect(countTriggerHits(q, pair)).toBe(1);
    const twins = stubCard("t.twin.000", pair);
    const single = stubCard("t.twin.000", one);
    expect(retrieve(q, [twins]).ranked[0]!.triggerHits).toBe(1);
    expect(retrieve(q, [twins]).ranked[0]!.score).toBe(retrieve(q, [single]).ranked[0]!.score);
  });

  it("overlapping matched spans of one card keep the strongest once", () => {
    const q = "ยาคุมฉุกเฉินกี่วันประจำเดือนมา";
    expect(countTriggerHits(q, ["ยาคุมฉุกเฉินกี่วัน", "ยาคุมฉุกเฉิน กี่วัน"])).toBe(1);
    expect(countTriggerHits(q, ["ยาคุมฉุกเฉินกี่วัน", "ยาคุมฉุกเฉินกี่วัน"])).toBe(1);
    // Distinct non-overlapping phrases still add.
    expect(countTriggerHits("pep ยาคุม", ["pep", "ยาคุม"])).toBe(2);
  });

  it("overlapping but different triggers score the same as the strongest alone", () => {
    const q = "alpha-beta-gamma";
    const overlapping = ["alpha-beta", "beta-gamma"];
    const strongest = ["alpha-beta-gamma"];
    expect(countTriggerHits(q, overlapping)).toBe(1);
    expect(countTriggerHits(q, overlapping)).toBe(countTriggerHits(q, strongest));
    const both = stubCard("t.overlap.000", overlapping, "general");
    const one = stubCard("t.overlap.000", strongest, "general");
    expect(retrieve(q, [both]).ranked[0]!.score).toBe(retrieve(q, [one]).ranked[0]!.score);
    expect(retrieve(q, [both]).ranked[0]!.triggerHits).toBe(1);
  });
});

describe("card #21 what-is EC vs timing", () => {
  const whatIs = [
    "ยาคุมฉุกเฉินคืออะไร",
    "อยากรู้เรื่องยาคุมฉุกเฉิน",
    "ยาคุมฉุกเฉินทำงานยังไง",
    "ยาคุมฉุกเฉินคืออะไรคะ",
    "เล่าเรื่องยาคุมฉุกเฉินให้หน่อย",
    "ยาคุมฉุกเฉินทำอะไร",
  ];
  const timing = [
    "ถุงยางรั่ว ต้องทำยังไง คุมฉุกเฉินทันไหม",
    "ยาคุมฉุกเฉินกินเมื่อไร",
    "กินยาคุมฉุกเฉินช้าไปแล้ว",
    "หลังมีเพศสัมพันธ์กี่ชั่วโมงยังกินยาคุมฉุกเฉินได้",
  ];

  it.each(whatIs)("retrieve() and runTurn send %s to urgent.pills.000", async (q) => {
    const r = retrieve(q, pool);
    expect(r.ranked[0]?.card.id, q).toBe("urgent.pills.000");
    const turn = await runTurn(newDialog(), q, deps());
    expect(turn.reply.kind === "card" && turn.reply.card.id, q).toBe("urgent.pills.000");
  });

  it("card-#21 what-is lines still land on urgent.pills.000 after overlap merge", () => {
    for (const q of ["ยาคุมฉุกเฉินคืออะไร", "อยากรู้เรื่องยาคุมฉุกเฉิน", "ยาคุมฉุกเฉินทำงานยังไง"]) {
      const r = retrieve(q, pool);
      expect(r.ranked[0]?.card.id, q).toBe("urgent.pills.000");
      // Nested what-is fragments occupy one overlapping cluster, so they are not rules-confident.
      expect(r.confident, q).toBe(false);
    }
  });

  it.each(timing)("retrieve() and runTurn send %s to ec.timing.b001", async (q) => {
    const r = retrieve(q, pool);
    expect(r.ranked[0]?.card.id, q).toBe("ec.timing.b001");
    const turn = await runTurn(newDialog(), q, deps());
    expect(turn.reply.kind === "card" && turn.reply.card.id, q).toBe("ec.timing.b001");
  });

  it("nearby non-EC routing is unchanged", () => {
    expect(topId("อยากรู้เรื่องคุมกำเนิด")).toBe("birth.control.000");
    expect(topId("ถุงยางรั่ว")).toBe("condom.leak.000");
    expect(retrieve("กลัวจะท้อง เพราะถุงยางรั่ว", pool).confident).toBe(false);
  });

  it("crisis still overrides an EC what-is line, with no wait", async () => {
    const t = performance.now();
    const r = await runTurn(newDialog(), "อยากตาย ยาคุมฉุกเฉินคืออะไร", deps());
    expect(performance.now() - t).toBeLessThan(50);
    expect(r.reply.kind).toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.categories).toContain("self_harm");
  });
});

describe("approved-card trigger regression", () => {
  it("every approved card's own triggers retrieve that card", () => {
    const found = triggerMisroutes();
    expect(found.some((line) => line.startsWith("urgent.pills.000\t"))).toBe(false);
    expect(found.some((line) => line.startsWith("hiv.test.under18.000\t"))).toBe(false);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("pregnancy.ec_ask.000 is an unreachable known exception, not a retrieval target", () => {
    const card = BANK.find((c) => c.id === "pregnancy.ec_ask.000")!;
    expect(card.triggers).toEqual([]);
    const inbound = BANK.flatMap((c) => c.next.filter((n) => n.card_id === "pregnancy.ec_ask.000")
      .map((n) => `${c.id} → ${n.label_th}`));
    expect(inbound, inbound.join("\n")).toEqual([]);
    expect(card.review.notes).toMatch(/unreachable via retrieval/i);
    expect(card.review.notes).toMatch(/Opendream/);
    // วิธีการกินยาคุมฉุกเฉิน belongs to the timing card; stealing it would move EC.
    expect(topId("วิธีการกินยาคุมฉุกเฉิน")).toBe("ec.timing.b001");
  });
});

const UNDER18_HIV = "hiv.test.under18.000";
const ADULT_HIV_TEST = "disease.hiv.002";

/** Synthetic under-18 HIV-test questions. Must not be answered by the adult test card. */
const UNDER18_HIV_QUESTIONS = [
  "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
  "เด็กตรวจเอชไอวีได้ไหม",
  "อยากตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
  "วัยรุ่นตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
  "เด็กตรวจเอชไอวีโดยไม่บอกผู้ปกครอง",
];

describe("card #34 under-18 HIV test (safety)", () => {
  it("each of hiv.test.under18.000's own triggers retrieves that card", () => {
    const card = BANK.find((c) => c.id === UNDER18_HIV)!;
    expect(card.triggers.length).toBeGreaterThan(0);
    for (const trigger of card.triggers) {
      expect(topId(trigger), trigger).toBe(UNDER18_HIV);
    }
  });

  it.each(UNDER18_HIV_QUESTIONS)("under-18 HIV test question %s is not answered by the adult card", (q) => {
    const r = retrieve(q, pool);
    expect(r.ranked[0]?.card.id, q).toBe(UNDER18_HIV);
    expect(r.ranked[0]?.card.id, q).not.toBe(ADULT_HIV_TEST);
  });

  it("adult HIV-test questions still land on disease.hiv.002", () => {
    expect(outcome("ตรวจเอชไอวี")).toEqual({ id: ADULT_HIV_TEST, conf: true });
    expect(outcome("อยากตรวจเอช")).toEqual({ id: ADULT_HIV_TEST, conf: true });
    expect(outcome("อาการเอชไอวี")).toEqual({ id: ADULT_HIV_TEST, conf: true });
  });
});

/** A timing trigger must name EC. Generic post-sex / when / still-in-time fragments are unsafe. */
const EC_TERM = /ยาคุมฉุกเฉิน|คุมฉุกเฉิน|ยาเม็ดคุมฉุกเฉิน|emergency contraception|postinor|morning after|(^|[^a-z])ec([^a-z]|$)/i;

const CROSS_TOPIC = [
  "PEP กินเมื่อไร หลังมีเพศสัมพันธ์ ยังทันไหม",
  "กินเป็ปทันไหม",
  "เป็ปกินเมื่อไร",
  "เพร็พกินเมื่อไร",
  "prep กินเมื่อไร",
  "เพร็พทันไหม",
  "หลังมีเพศสัมพันธ์ แสบ คัน",
  "เลือดออกหลังมีเพศสัมพันธ์",
  "หลังมีเพศสัมพันธ์ ปวด",
  "หลังมีเพศสัมพันธ์ คัน",
  "ตรวจครรภ์เมื่อไร",
  "ที่ตรวจครรภ์กี่วัน",
  "ตรวจครรภ์กี่วันหลังมีเพศสัมพันธ์",
  "ถุงยางรั่ว",
  "ถุงยางแตก",
  "ถุงยางรั่ว ต้องทำยังไง",
  "ลืมกินยาคุม",
  "กินยาคุมยังไง",
  "ยาคุมรายเดือน",
  "ยาคุมฉุกเฉิน",
  "คุมฉุกเฉิน",
  "ยาคุมฉุกเฉินอันตรายไหม",
  "ยาคุมฉุกเฉินมีผลข้างเคียงไหม",
  "ยาคุมฉุกเฉินกินได้กี่ครั้ง",
  "ยาคุมฉุกเฉินคืออะไร",
  "อยากรู้เรื่องยาคุมฉุกเฉิน",
  "ยาคุมฉุกเฉินทำงานยังไง",
  "ยาคุมฉุกเฉินคืออะไรคะ",
  "เล่าเรื่องยาคุมฉุกเฉินให้หน่อย",
  "ยาคุมฉุกเฉินทำอะไร",
  "ถุงยางรั่ว ต้องทำยังไง คุมฉุกเฉินทันไหม",
  "ยาคุมฉุกเฉินกินเมื่อไร",
  "กินยาคุมฉุกเฉินช้าไปแล้ว",
  "หลังมีเพศสัมพันธ์กี่ชั่วโมงยังกินยาคุมฉุกเฉินได้",
  "อยากรู้เรื่องคุมกำเนิด",
  "กลัวจะท้อง เพราะถุงยางรั่ว",
];

/** Bare / generic EC → #21. Overlap merge: nested fragments on one card score once. */
const INTENDED_VS_C450: Record<string, { id: string; conf: boolean }> = {
  "ยาคุมฉุกเฉินคืออะไร": { id: "urgent.pills.000", conf: false },
  "อยากรู้เรื่องยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินทำงานยังไง": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินคือ": { id: "urgent.pills.000", conf: false },
  "เรื่องยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินทำ": { id: "urgent.pills.000", conf: false },
  "คุมฉุกเฉิน": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินอันตราย": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินมีผลข้างเคียง": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินกินได้กี่ครั้ง": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินอันตรายไหม": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินมีผลข้างเคียงไหม": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินคืออะไรคะ": { id: "urgent.pills.000", conf: false },
  "เล่าเรื่องยาคุมฉุกเฉินให้หน่อย": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินทำอะไร": { id: "urgent.pills.000", conf: false },
  "ถุงยางรั่ว ต้องทำยังไง คุมฉุกเฉินทันไหม": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉินทันไหม": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกินเมื่อไร": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินช้า": { id: "ec.timing.b001", conf: false },
  "ยังกินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินยังทัน": { id: "ec.timing.b001", conf: false },
  "วิธีการกินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินช้าไปแล้ว": { id: "ec.timing.b001", conf: false },
  "หลังมีเพศสัมพันธ์กี่ชั่วโมงยังกินยาคุมฉุกเฉินได้": { id: "ec.timing.b001", conf: false },
  // Own-trigger fragments outrank the sibling stem; unique-score tie keeps conf false.
  "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง": { id: "hiv.test.under18.000", conf: false },
  "เด็กตรวจเอชไอวีได้ไหม": { id: "hiv.test.under18.000", conf: false },
  "วิธีใช้ถุงยาง": { id: "condom.how_to.000", conf: false },
  "ยาคุมรายเดือน": { id: "birth.control.pills.000", conf: false },
  "กินยาคุมยังไง": { id: "birth.control.pills.000", conf: false },
  "ยาคุม 21 เม็ด": { id: "birth.control.pills.000", conf: false },
  "ฝังยาคุม": { id: "birth.control.implant.000", conf: false },
  "สงสัยว่าติดหนองใน": { id: "disease.gonorrhea.001", conf: false },
  "เป็นหนองใน": { id: "disease.gonorrhea.001", conf: false },
  "เริมรักษาหาย": { id: "disease.herpes.002", conf: false },
  "เริมหายขาด": { id: "disease.herpes.002", conf: false },
  "อาการซิฟิลิส": { id: "disease.syphilis.001", conf: false },
  "แผลซิฟิลิส": { id: "disease.syphilis.001", conf: false },
  "ราคาเพร็พ": { id: "price.trc.prep.000", conf: false },
  "เพร็พกี่บาท": { id: "price.trc.prep.000", conf: false },
  // Space-twin / overlap: still top timing, no longer rules-confident.
  "กินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "กิน ยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉินกินเมื่อไร": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉิน กินเมื่อไร": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินช้า": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉิน ช้า": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉินทัน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉิน ทัน": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกี่ชั่วโมง": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉิน กี่ชั่วโมง": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกี่วัน": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉิน กี่วัน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉินยังทัน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉิน ยังทัน": { id: "ec.timing.b001", conf: false },
};

/** Twin-dedupe + overlap merge vs e948e1c: same top card; stacked spans no longer add. */
const INTENDED_VS_E948: Record<string, { id: string; conf: boolean }> = {
  "กินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "กิน ยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉินกินเมื่อไร": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉิน กินเมื่อไร": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินช้า": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉิน ช้า": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉินทัน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉิน ทัน": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกี่ชั่วโมง": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉิน กี่ชั่วโมง": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกี่วัน": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉิน กี่วัน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉินยังทัน": { id: "ec.timing.b001", conf: false },
  "คุมฉุกเฉิน ยังทัน": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกี่วันประจำเดือนมา": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกี่วันถึงตรวจครรภ์ได้": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินแล้วประจำเดือนจะมาเมื่อไร": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินไปแล้วกี่วันตรวจท้องได้": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินแล้วคลื่นไส้นานแค่ไหน": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินแล้วเลือดออกนานไหม": { id: "ec.timing.b001", conf: false },
  "หลังกินยาคุมฉุกเฉินตรวจท้องเมื่อไร": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินแล้วประจำเดือนไม่มา": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินได้กี่ครั้ง": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินบ่อยอันตรายไหม": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินแล้วมีผลข้างเคียงไหม": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินกี่วันประจำเดือนมา": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินกี่วันตรวจครรภ์ได้": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินกี่ชั่วโมงหายคลื่นไส้": { id: "ec.timing.b001", conf: false },
  "หลังกินยาคุมฉุกเฉินกี่วันตรวจครรภ์ได้": { id: "ec.timing.b001", conf: false },
  "ยังกินยาคุมฉุกเฉินได้กี่ครั้ง": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินคืออะไร": { id: "urgent.pills.000", conf: false },
  "อยากรู้เรื่องยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินทำงานยังไง": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินคือ": { id: "urgent.pills.000", conf: false },
  "เรื่องยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินทำ": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินอันตราย": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินมีผลข้างเคียง": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินกินได้กี่ครั้ง": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินอันตรายไหม": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินมีผลข้างเคียงไหม": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินคืออะไรคะ": { id: "urgent.pills.000", conf: false },
  "เล่าเรื่องยาคุมฉุกเฉินให้หน่อย": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินทำอะไร": { id: "urgent.pills.000", conf: false },
  "คุมฉุกเฉินทันไหม": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินกินเมื่อไร": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินช้า": { id: "ec.timing.b001", conf: false },
  "ยังกินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "ยาคุมฉุกเฉินยังทัน": { id: "ec.timing.b001", conf: false },
  "วิธีการกินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: false },
  "ถุงยางรั่ว ต้องทำยังไง คุมฉุกเฉินทันไหม": { id: "ec.timing.b001", conf: false },
  "กินยาคุมฉุกเฉินช้าไปแล้ว": { id: "ec.timing.b001", conf: false },
  "หลังมีเพศสัมพันธ์กี่ชั่วโมงยังกินยาคุมฉุกเฉินได้": { id: "ec.timing.b001", conf: false },
  "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง": { id: "hiv.test.under18.000", conf: false },
  "เด็กตรวจเอชไอวีได้ไหม": { id: "hiv.test.under18.000", conf: false },
  "วิธีใช้ถุงยาง": { id: "condom.how_to.000", conf: false },
  "ยาคุมรายเดือน": { id: "birth.control.pills.000", conf: false },
  "กินยาคุมยังไง": { id: "birth.control.pills.000", conf: false },
  "ยาคุม 21 เม็ด": { id: "birth.control.pills.000", conf: false },
  "ฝังยาคุม": { id: "birth.control.implant.000", conf: false },
  "สงสัยว่าติดหนองใน": { id: "disease.gonorrhea.001", conf: false },
  "เป็นหนองใน": { id: "disease.gonorrhea.001", conf: false },
  "เริมรักษาหาย": { id: "disease.herpes.002", conf: false },
  "เริมหายขาด": { id: "disease.herpes.002", conf: false },
  "อาการซิฟิลิส": { id: "disease.syphilis.001", conf: false },
  "แผลซิฟิลิส": { id: "disease.syphilis.001", conf: false },
  "ราคาเพร็พ": { id: "price.trc.prep.000", conf: false },
  "เพร็พกี่บาท": { id: "price.trc.prep.000", conf: false },
  // Known gap #28: mixed what-is + hours still land on urgent.pills.000.
  "ยาคุมฉุกเฉินคืออะไร กินได้กี่ชั่วโมง": { id: "urgent.pills.000", conf: false },
  "อยากรู้เรื่องยาคุมฉุกเฉิน กินภายในกี่ชั่วโมง": { id: "urgent.pills.000", conf: false },
};

const PEP_QUERIES = [
  "PEP กินเมื่อไร หลังมีเพศสัมพันธ์ ยังทันไหม",
  "กินเป็ปทันไหม",
  "เป็ปกินเมื่อไร",
  "เป็ป",
  "pep",
  "ยาเป็ป",
];

function outcome(q: string) {
  const r = retrieve(q, pool);
  return { id: r.ranked[0]?.card.id ?? FALLBACK_ID, conf: r.confident };
}

describe("retrieve baseline diff gate (c450e1f)", () => {
  const rows = baselineFile.queries;
  const byQ = new Map(rows.map((r) => [r.q, r]));

  it("has the frozen c450e1f table and a fixed corpus of every approved trigger plus cross-topic lines", () => {
    expect(baselineFile.baseline_commit).toBe("c450e1fbfa8f2618e86107f5e6cd2f41cc3de8f3");
    expect(rows).toHaveLength(123);
    const triggerQs = new Set<string>();
    for (const card of BANK) {
      if (card.review.status !== "approved") continue;
      if (card.id === FALLBACK_ID || card.id === WELCOME_ID) continue;
      for (const t of card.triggers) triggerQs.add(t);
    }
    const missing = [...triggerQs].filter((t) => !byQ.has(t));
    expect(missing.sort(), missing.join("\n")).toEqual([...NEW_OWN_TRIGGER_FRAGMENTS].sort());
    for (const t of NEW_OWN_TRIGGER_FRAGMENTS) {
      const owners = BANK.filter((c) => c.review.status === "approved" && c.triggers.includes(t)).map((c) => c.id);
      expect(owners, t).toEqual([expect.any(String)]);
      expect(owners).toHaveLength(1);
      const term = OWNER_TOPIC_TERM[owners[0]!];
      expect(term, `${owners[0]} needs a topic term for new fragment ${t}`).toBeTruthy();
      expect(term.test(t), `${owners[0]} fragment "${t}" must carry the topic word`).toBe(true);
      if (owners[0] === "price.trc.prep.000") {
        expect(/ราคา|บาท|แพง|ค่า/.test(t), `${t} must carry an unambiguous price word`).toBe(true);
      }
    }
    for (const q of CROSS_TOPIC) expect(byQ.has(q), q).toBe(true);
  });

  it("every ec.timing trigger names an EC term", () => {
    const timing = BANK.find((c) => c.id === "ec.timing.b001")!;
    const bare = timing.triggers.filter((t) => !EC_TERM.test(t));
    expect(bare, bare.join("\n")).toEqual([]);
  });

  it("matches c450e1f except the intended EC moves, and PEP is unchanged", () => {
    const unexpected: string[] = [];
    for (const row of rows) {
      const got = outcome(row.q);
      const intended = INTENDED_VS_C450[row.q];
      const want = intended ?? { id: row.id, conf: row.conf };
      if (got.id !== want.id || got.conf !== want.conf) {
        unexpected.push(`${row.q}\tc450=${row.id}/${row.conf}\tgot=${got.id}/${got.conf}\twant=${want.id}/${want.conf}`);
      }
    }
    expect(unexpected, unexpected.join("\n")).toEqual([]);
    for (const q of PEP_QUERIES) {
      const base = byQ.get(q)!;
      expect(outcome(q), q).toEqual({ id: base.id, conf: base.conf });
      expect(outcome(q).id, q).toBe("protection.pep.000");
    }
  });
});

const extraByGroup = (g: string) => extraFile.queries.filter((r) => r.group === g).map((r) => r.q);

/**
 * Hour-window landings after matcher work. Routing is recorded, not desired.
 * Mixed what-is + hours stay on urgent.pills.000 (known gap,
 * https://github.com/opendream/jane-bot/issues/28), not the 72h card.
 */
const HOUR_WINDOW_NOW: Record<string, { id: string; conf: boolean }> = {
  "ยาคุมฉุกเฉินกินภายในกี่ชั่วโมง": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินควรกินเมื่อไร": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉิน 3 วันยังทันไหม": { id: "urgent.pills.000", conf: false },
  // Known gap #28: mixed what-is + hours still land on urgent.pills.000.
  "ยาคุมฉุกเฉินคืออะไร กินได้กี่ชั่วโมง": { id: "urgent.pills.000", conf: false },
  "อยากรู้เรื่องยาคุมฉุกเฉิน กินภายในกี่ชั่วโมง": { id: "urgent.pills.000", conf: false },
};

describe("synthetic extra routing (post-EC, how-often, hour-window, PEP)", () => {
  it("outcome() exposes conf (not confident) so extra-row timing guards can fail", () => {
    const got = outcome("pep");
    expect(got).toEqual({ id: "protection.pep.000", conf: true });
    expect(Object.keys(got).sort()).toEqual(["conf", "id"]);
    expect((got as { confident?: boolean }).confident).toBeUndefined();
  });

  it("covers the extra groups and every extra row is in the e948 snapshot", () => {
    expect(extraByGroup("post_ec").length).toBeGreaterThanOrEqual(10);
    expect(extraByGroup("how_often")).toEqual(expect.arrayContaining([
      "กินยาคุมฉุกเฉินได้กี่ครั้ง",
      "กินยาคุมฉุกเฉินบ่อยอันตรายไหม",
      "กินยาคุมฉุกเฉินแล้วมีผลข้างเคียงไหม",
      "กินยาคุมฉุกเฉิน",
      "ยังกินยาคุมฉุกเฉินได้กี่ครั้ง",
    ]));
    expect(extraByGroup("post_ec")).toEqual(expect.arrayContaining([
      "กินยาคุมฉุกเฉินกี่วันประจำเดือนมา",
      "กินยาคุมฉุกเฉินกี่วันตรวจครรภ์ได้",
      "กินยาคุมฉุกเฉินกี่ชั่วโมงหายคลื่นไส้",
      "หลังกินยาคุมฉุกเฉินกี่วันตรวจครรภ์ได้",
    ]));
    expect(extraByGroup("hour_window")).toEqual(expect.arrayContaining([
      "ยาคุมฉุกเฉินกินภายในกี่ชั่วโมง",
      "ยาคุมฉุกเฉินควรกินเมื่อไร",
      "ยาคุมฉุกเฉิน 3 วันยังทันไหม",
    ]));
    const e948 = new Set(e948File.queries.map((r) => r.q));
    for (const r of extraFile.queries) expect(e948.has(r.q), r.q).toBe(true);
  });

  it("post-EC follow-ups are not rules-confident on ec.timing.b001", () => {
    for (const q of extraByGroup("post_ec")) {
      const r = retrieve(q, pool);
      const top = r.ranked[0]?.card.id;
      expect(r.confident && top === "ec.timing.b001", `${q} → ${top}/${r.confident}`).toBe(false);
    }
  });

  it("how-often / side-effect / bare กินยาคุมฉุกเฉิน are not rules-confident on ec.timing", () => {
    for (const q of extraByGroup("how_often")) {
      const r = retrieve(q, pool);
      const top = r.ranked[0]?.card.id;
      expect(r.confident && top === "ec.timing.b001", `${q} → ${top}/${r.confident}`).toBe(false);
    }
  });

  it("records hour-window landings (known gap) and keeps PEP unchanged vs e948 and c450", () => {
    for (const [q, want] of Object.entries(HOUR_WINDOW_NOW)) {
      expect(outcome(q), q).toEqual(want);
    }
    const e948 = new Map(e948File.queries.map((r) => [r.q, r]));
    for (const q of extraByGroup("pep")) {
      const got = outcome(q);
      expect(got.id, q).toBe("protection.pep.000");
      expect(got, q).toEqual({ id: e948.get(q)!.id, conf: e948.get(q)!.conf });
      const c450 = extraFile.queries.find((r) => r.q === q)!.c450;
      expect(got, q).toEqual(c450);
    }
  });

  it("extra rows vs c450 only move on the twin-dedupe / overlap-merge / #21 split", () => {
    const unexpected: string[] = [];
    for (const row of extraFile.queries) {
      const got = outcome(row.q);
      const want = row.group === "pep"
        ? row.c450
        : (INTENDED_VS_E948[row.q] ?? HOUR_WINDOW_NOW[row.q] ?? INTENDED_VS_C450[row.q]);
      if (want) {
        if (got.id !== want.id || got.conf !== want.conf) {
          unexpected.push(`${row.q}\tc450=${row.c450.id}/${row.c450.conf}\tgot=${got.id}/${got.conf}\twant=${want.id}/${want.conf}`);
        }
      } else if (got.conf && got.id === "ec.timing.b001") {
        unexpected.push(`${row.q}\tc450=${row.c450.id}/${row.c450.conf}\tgot=${got.id}/${got.conf}\twant=not confident on ec.timing`);
      }
    }
    expect(unexpected, unexpected.join("\n")).toEqual([]);
  });
});

describe("cross-topic negatives (synthetic)", () => {
  it("has the e011cd0 pin and the price / teen-consent / pus / how-to / adult-HIV-privacy / fragment-sweep groups", () => {
    expect(crossTopicNegatives.base_commit).toBe("e011cd0a2c06cd44f2cf1fb6205790a17f2a3e59");
    const groups = new Set(crossTopicNegatives.queries.map((r) => r.group));
    expect([...groups].sort()).toEqual(["adult_hiv_privacy", "fragment_sweep", "how_to", "price", "pus", "teen_consent", "teen_consent_hiv"].sort());
    const teenQs = new Set(crossTopicNegatives.queries.filter((r) => r.group === "teen_consent").map((r) => r.q));
    for (const q of [
      "อายุ 17 กินเพร็พป้องกันเอชไอวีโดยไม่บอกผู้ปกครองได้ไหม",
      "ขอยา PEP ป้องกันเอชไอวีโดยไม่บอกผู้ปกครองได้ไหม",
      "เพิ่งมีเซ็กส์ไม่ป้องกัน ขอยาป้องกันเอชไอวีโดยไม่บอกผู้ปกครองได้ไหม",
      "ติดเชื้อเอชไอวีโดยไม่บอกผู้ปกครองรักษาได้ไหม",
    ]) {
      expect(teenQs.has(q), q).toBe(true);
    }
  });

  it("price / teen-consent / pus / how-to / adult-HIV-privacy / fragment-sweep rows stay off the wrong card and match e011cd0 except HIV teen-consent", () => {
    const unexpected: string[] = [];
    for (const row of crossTopicNegatives.queries) {
      const got = outcome(row.q);
      if (row.group === "teen_consent_hiv") {
        if (got.id !== row.id) {
          unexpected.push(`${row.q}\tgot=${got.id}/${got.conf}\twant=${row.id} (HIV teen-consent)`);
        }
      } else if (got.id !== row.e011cd0.id || got.conf !== row.e011cd0.conf) {
        unexpected.push(`${row.q}\te011cd0=${row.e011cd0.id}/${row.e011cd0.conf}\tgot=${got.id}/${got.conf}`);
      }
      if (row.not_id && got.id === row.not_id) {
        unexpected.push(`${row.q}\tlanded on forbidden ${row.not_id}`);
      }
      if (row.not_confident_on && got.conf && got.id === row.not_confident_on) {
        unexpected.push(`${row.q}\tconfident on forbidden ${row.not_confident_on}`);
      }
      if (row.keep_e011cd0 && (got.id !== row.e011cd0.id || got.conf !== row.e011cd0.conf)) {
        unexpected.push(`${row.q}\tmust keep e011cd0 ${row.e011cd0.id}/${row.e011cd0.conf} got=${got.id}/${got.conf}`);
      }
    }
    expect(unexpected, unexpected.join("\n")).toEqual([]);
  });
});

describe("retrieve baseline diff gate (e948e1c)", () => {
  it("has the frozen e948e1c table covering the 123-query corpus plus extra rows", () => {
    expect(e948File.commit).toBe("e948e1ca7c79048818d522c8ca536f9704e07758");
    expect(e948File.queries).toHaveLength(148);
    const byQ = new Set(e948File.queries.map((r) => r.q));
    for (const row of baselineFile.queries) expect(byQ.has(row.q), row.q).toBe(true);
    for (const row of extraFile.queries) expect(byQ.has(row.q), row.q).toBe(true);
  });

  it("matches e948e1c except the intended twin-dedupe / overlap-merge confidence drops", () => {
    const unexpected: string[] = [];
    for (const row of e948File.queries) {
      const got = outcome(row.q);
      const intended = INTENDED_VS_E948[row.q];
      const want = intended ?? { id: row.id, conf: row.conf };
      if (got.id !== want.id || got.conf !== want.conf) {
        unexpected.push(`${row.q}\te948=${row.id}/${row.conf}\tgot=${got.id}/${got.conf}\twant=${want.id}/${want.conf}`);
      }
    }
    expect(unexpected, unexpected.join("\n")).toEqual([]);
  });
});

const PREP_PRICE_ID = "price.trc.prep.000";
const PREP_GENERAL_ID = "protection.prep.000";
const prepPriceByGroup = (g: string) => prepPriceFile.queries.filter((r) => r.group === g);

describe("PrEP price routing vs 476b992 (synthetic)", () => {
  it("has the frozen 476b992 table covering existing routing fixtures plus PrEP-price rows", () => {
    expect(frozen476File.baseline_commit).toBe("476b992c7e172a3b86d12799a515f5c1a4b081a2");
    expect(prepPriceFile.base_commit).toBe("476b992c7e172a3b86d12799a515f5c1a4b081a2");
    expect(frozen476File.queries).toHaveLength(304);
    const byQ = new Set(frozen476File.queries.map((r) => r.q));
    for (const row of baselineFile.queries) expect(byQ.has(row.q), row.q).toBe(true);
    for (const row of extraFile.queries) expect(byQ.has(row.q), row.q).toBe(true);
    for (const row of e948File.queries) expect(byQ.has(row.q), row.q).toBe(true);
    for (const row of crossTopicNegatives.queries) expect(byQ.has(row.q), row.q).toBe(true);
    for (const row of prepPriceFile.queries) expect(byQ.has(row.q), row.q).toBe(true);
    expect([...new Set(prepPriceByGroup("prep_price").map((r) => r.q))]).toEqual(expect.arrayContaining([
      "PrEP ราคาเท่าไหร่",
      "ยาเพร็พ ราคาเท่าไหร่คะ",
      "ราคาเพร็พ",
      "เพร็พกี่บาท",
      "PrEP แพงไหม",
      "ค่ายา PrEP เท่าไหร่",
    ]));
  });

  it("routes PrEP price questions and close variants to price.trc.prep.000", () => {
    for (const row of prepPriceByGroup("prep_price")) {
      expect(outcome(row.q).id, row.q).toBe(PREP_PRICE_ID);
    }
  });

  it("phone-retest lines retrieve and runTurn to the price card, not #34", async () => {
    for (const q of ["PrEP ราคาเท่าไหร่", "ยาเพร็พ ราคาเท่าไหร่คะ"]) {
      const r = retrieve(q, pool);
      expect(r.ranked[0]?.card.id, q).toBe(PREP_PRICE_ID);
      expect(r.ranked[0]?.card.id, q).not.toBe(UNDER18_HIV);
      const turn = await runTurn(newDialog(), q, deps());
      expect(turn.reply.kind === "card" && turn.reply.card.id, q).toBe(PREP_PRICE_ID);
    }
  });

  it("keeps general PrEP questions on protection.prep.000", () => {
    for (const row of prepPriceByGroup("prep_general")) {
      const got = outcome(row.q);
      expect(got.id, row.q).toBe(PREP_GENERAL_ID);
      expect(got.id, row.q).toBe(row.id);
    }
  });

  it("dose/efficacy/timing เท่าไหร่ and กี่ questions stay confident on protection.prep.000", () => {
    const qs = prepPriceByGroup("prep_dose_efficacy").map((r) => r.q);
    expect(qs).toEqual(expect.arrayContaining([
      "กินเพร็พเท่าไหร่ถึงจะป้องกันได้",
      "ต้องกินยาเพร็พเท่าไหร่ถึงจะได้ผล",
      "ประสิทธิภาพของเพร็พเท่าไหร่",
      "prep เท่าไหร่ถึงได้ผล",
      "กินเพร็พกี่เม็ด",
      "เพร็พกินกี่วันถึงจะป้องกัน",
      "prep ป้องกันได้กี่เปอร์เซ็นต์",
    ]));
    for (const row of prepPriceByGroup("prep_dose_efficacy")) {
      expect(outcome(row.q), row.q).toEqual({ id: PREP_GENERAL_ID, conf: true });
      expect(outcome(row.q).id, row.q).not.toBe(PREP_PRICE_ID);
    }
  });

  it("price.trc.prep.000 fragments pair a PrEP topic word with an unambiguous price word", () => {
    const card = BANK.find((c) => c.id === PREP_PRICE_ID)!;
    const topic = /เพร็พ|prep/i;
    const price = /ราคา|บาท|แพง|ค่า/;
    const bad = card.triggers.filter((t) => !topic.test(t) || !price.test(t));
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("main price phrasings win on listed-match ties, not rules-confident unique hits", () => {
    for (const q of ["PrEP ราคาเท่าไหร่", "ยาเพร็พ ราคาเท่าไหร่คะ", "ราคาเพร็พ", "เพร็พกี่บาท"]) {
      expect(outcome(q), q).toEqual({ id: PREP_PRICE_ID, conf: false });
    }
  });

  it("does not move PEP price or other price cards onto the PrEP price card", () => {
    for (const row of [...prepPriceByGroup("pep_price"), ...prepPriceByGroup("other_price")]) {
      const got = outcome(row.q);
      expect(got.id, row.q).not.toBe(PREP_PRICE_ID);
      if (row.not_id) expect(got.id, row.q).not.toBe(row.not_id);
      if (row.id) expect(got.id, row.q).toBe(row.id);
    }
  });

  it("keeps #34 HIV privacy: under-18 test vs adult partner vs teen PEP/PrEP", () => {
    expect(outcome("อายุ 16 อยากตรวจเอชไอวีโดยไม่บอกผู้ปกครอง").id).toBe(UNDER18_HIV);
    expect(outcome("อยากตรวจเอชไอวีโดยไม่บอกแฟน")).toEqual({ id: ADULT_HIV_TEST, conf: true });
    for (const row of prepPriceByGroup("hiv_privacy")) {
      const got = outcome(row.q);
      expect(got.id, row.q).toBe(row.id);
      expect(got.id, row.q).not.toBe(row.not_id);
    }
  });

  it("new PrEP-price fragments inside other-topic sentences do not steal", () => {
    for (const row of prepPriceByGroup("fragment_sweep")) {
      const got = outcome(row.q);
      expect(got.id, row.q).toBe(row.id);
      expect(got.id, row.q).not.toBe(PREP_PRICE_ID);
    }
  });

  it("corpus diff vs 476b992: only intended PrEP-price moves, 0 unintended", () => {
    const intended: string[] = [];
    const unintended: string[] = [];
    for (const row of frozen476File.queries) {
      const got = outcome(row.q);
      if (got.id === row.id && got.conf === row.conf) continue;
      // Intended: general PrEP card → PrEP price card. Anything else is a steal.
      if (got.id === PREP_PRICE_ID && row.id === PREP_GENERAL_ID) {
        intended.push(`${row.q}\t${row.id}/${row.conf} → ${got.id}/${got.conf}`);
      } else {
        unintended.push(`${row.q}\t476b992=${row.id}/${row.conf}\tgot=${got.id}/${got.conf}`);
      }
    }
    expect(unintended, unintended.join("\n")).toEqual([]);
    expect(intended.every((line) => line.endsWith("/false")), intended.join("\n")).toBe(true);
    expect(intended.length, intended.join("\n")).toBe(45);
  });
});
