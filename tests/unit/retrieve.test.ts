import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { shippable } from "../../src/core/bank";
import { countTriggerHits, retrieve } from "../../src/core/retrieve";
import { findPhrases } from "../../src/core/text";
import { FALLBACK_ID, WELCOME_ID, runTurn, newDialog, type TurnDeps } from "../../src/core/dialog";
import baselineFile from "../fixtures/retrieve-c450-baseline.json";

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
      if (typeof trigger !== "string") continue;
      const top = topId(trigger) ?? "(none)";
      if (top !== card.id) out.push(row(card.id, trigger, top));
    }
  }
  return out;
}

/** Pre-existing short-trigger collisions (same score, earlier sibling wins). The check fails if this set changes. */
const EXISTING_TRIGGER_COLLISIONS = [
  row("condom.how_to.000", "วิธีใช้ถุงยาง", "condom.000"),
  row("birth.control.pills.000", "ยาคุมรายเดือน", "birth.control.000"),
  row("birth.control.pills.000", "กินยาคุมยังไง", "birth.control.000"),
  row("birth.control.pills.000", "ยาคุม 21 เม็ด", "birth.control.000"),
  row("birth.control.implant.000", "ฝังยาคุม", "birth.control.000"),
  row("pregnancy.ec_ask.000", "วิธีการกินยาคุมฉุกเฉิน", "ec.timing.b001"),
  row("disease.gonorrhea.001", "สงสัยว่าติดหนองใน", "disease.gonorrhea.000"),
  row("disease.gonorrhea.001", "เป็นหนองใน", "disease.gonorrhea.000"),
  row("disease.herpes.002", "เริมรักษาหาย", "disease.herpes.000"),
  row("disease.herpes.002", "เริมหายขาด", "disease.herpes.000"),
  row("disease.syphilis.001", "อาการซิฟิลิส", "disease.syphilis.000"),
  row("disease.syphilis.001", "แผลซิฟิลิส", "disease.syphilis.000"),
  row("hiv.test.under18.000", "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง", "disease.hiv.002"),
  row("hiv.test.under18.000", "เด็กตรวจเอชไอวีได้ไหม", "disease.hiv.002"),
  row("price.trc.prep.000", "ราคาเพร็พ", "protection.prep.000"),
  row("price.trc.prep.000", "เพร็พกี่บาท", "protection.prep.000"),
  row("price.trc.prep.000", "ซื้อยาเพร็พ", "protection.prep.000"),
];

describe("co-occurrence trigger form", () => {
  const strings = ["ผลข้างเคียง", "ยาคุม"];
  const mixed = ["ผลข้างเคียง", { all: ["ยาคุมฉุกเฉิน", "กี่ชั่วโมง"] }] as const;

  it("string-only lists score identically to findPhrases", () => {
    for (const q of [
      "ยาคุมมีผลข้างเคียงไหม",
      "ผลข้างเคียง ของ ยาคุม",
      "pep",
      "ยาคุมฉุกเฉินกี่ชั่วโมง",
      "",
    ]) {
      expect(countTriggerHits(q, strings), q).toBe(findPhrases(q, strings).length);
    }
  });

  it("all-tokens match in any order and do not change the string hit count", () => {
    expect(countTriggerHits("กี่ชั่วโมง ต้องกินยาคุมฉุกเฉิน", mixed)).toBe(1);
    expect(countTriggerHits("ยาคุมฉุกเฉินกินได้กี่ชั่วโมง", mixed)).toBe(1);
    expect(countTriggerHits("ยาคุมฉุกเฉินมีผลข้างเคียง", mixed)).toBe(1);
    expect(countTriggerHits("ยาคุมฉุกเฉินกี่ชั่วโมงมีผลข้างเคียง", mixed)).toBe(2);
    expect(countTriggerHits("กี่ชั่วโมง", mixed)).toBe(0);
    expect(countTriggerHits("ยาคุมฉุกเฉิน", mixed)).toBe(0);
    expect(countTriggerHits("ยาคุมฉุกเฉินกี่ชั่วโมงมีผลข้างเคียง", mixed)).toBe(
      findPhrases("ยาคุมฉุกเฉินกี่ชั่วโมงมีผลข้างเคียง", ["ผลข้างเคียง"]).length + 1,
    );
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
    "กินยาคุมฉุกเฉินได้กี่ครั้ง",
    "กินยาคุมฉุกเฉินบ่อยอันตรายไหม",
    "กินยาคุมฉุกเฉินบ่อยๆได้ไหม",
    "กินยาคุมฉุกเฉินแล้วมีผลข้างเคียงไหม",
    "กินยาคุมฉุกเฉินอันตรายไหม",
    "กินยาคุมฉุกเฉินมีผลข้างเคียงไหม",
    "ยาคุมฉุกเฉินอันตรายไหมครับ",
    "ยาคุมฉุกเฉินมีผลข้างเคียงไหมคะ",
    "ยาคุมฉุกเฉินกินได้กี่ครั้งค่ะ",
  ];
  const timing = [
    "ถุงยางรั่ว ต้องทำยังไง คุมฉุกเฉินทันไหม",
    "ยาคุมฉุกเฉินกินเมื่อไร",
    "กินยาคุมฉุกเฉินช้าไปแล้ว",
    "หลังมีเพศสัมพันธ์กี่ชั่วโมงยังกินยาคุมฉุกเฉินได้",
    "ยาคุมฉุกเฉินกินหลังมีเพศสัมพันธ์ได้กี่ชั่วโมง",
    "ยาคุมฉุกเฉินกินภายในกี่ชั่วโมง",
    "ยาคุมฉุกเฉินต้องกินภายในกี่ชั่วโมง",
    "ยาคุมฉุกเฉินกินกี่ชั่วโมง",
    "กี่ชั่วโมงยาคุมฉุกเฉิน",
    "กี่วัน ยาคุมฉุกเฉิน",
    "ภายในกี่ชั่วโมงต้องกินยาคุมฉุกเฉิน",
    "ยาคุมฉุกเฉินหลังมีเพศสัมพันธ์นานแค่ไหน",
    "หลังมีเพศสัมพันธ์นานแค่ไหนยาคุมฉุกเฉิน",
    "ลืมกินยาคุมฉุกเฉิน",
    "กินยาคุมฉุกเฉินช้าไปไหม",
    "ยาคุมฉุกเฉินทันไหม",
    "ยาคุมฉุกเฉินยังทันไหม",
    "กี่ชั่วโมงหลังมีเพศสัมพันธ์กินยาคุมฉุกเฉินได้",
    "ยาคุมฉุกเฉินกี่ชั่วโมงค่ะ",
    "ยาคุมฉุกเฉินกินเมื่อไรคะ",
    "กินยาคุมฉุกเฉินช้าไปแล้วครับ",
    "ยาคุมฉุกเฉินคืออะไร กินได้กี่ชั่วโมง",
    "อยากรู้เรื่องยาคุมฉุกเฉิน กินภายในกี่ชั่วโมง",
    "ยาคุมฉุกเฉินทำงานยังไง ทันไหม",
    "ยาคุมฉุกเฉินคืออะไร หลังมีเพศสัมพันธ์นานแค่ไหน",
  ];

  it.each(whatIs)("retrieve() and runTurn send %s to urgent.pills.000", async (q) => {
    const r = retrieve(q, pool);
    expect(r.ranked[0]?.card.id, q).toBe("urgent.pills.000");
    const turn = await runTurn(newDialog(), q, deps());
    expect(turn.reply.kind === "card" && turn.reply.card.id, q).toBe("urgent.pills.000");
  });

  it("the three card-#21 triggers are rules-confident", () => {
    for (const q of ["ยาคุมฉุกเฉินคืออะไร", "อยากรู้เรื่องยาคุมฉุกเฉิน", "ยาคุมฉุกเฉินทำงานยังไง"]) {
      const r = retrieve(q, pool);
      expect(r.confident, q).toBe(true);
      expect(r.ranked[0]?.card.id, q).toBe("urgent.pills.000");
      expect(r.ranked[0]!.score).toBeGreaterThan(r.ranked[1]?.score ?? 0);
    }
  });

  it("how-often / danger / side-effect กิน-forms are rules-confident on #21", () => {
    for (const q of [
      "กินยาคุมฉุกเฉินได้กี่ครั้ง",
      "กินยาคุมฉุกเฉินบ่อยอันตรายไหม",
      "กินยาคุมฉุกเฉินบ่อยๆได้ไหม",
      "กินยาคุมฉุกเฉินแล้วมีผลข้างเคียงไหม",
    ]) {
      const r = retrieve(q, pool);
      expect(r.ranked[0]?.card.id, q).toBe("urgent.pills.000");
      expect(r.confident, q).toBe(true);
    }
  });

  it("EC hour/timing questions are rules-confident wherever the timing word sits", () => {
    for (const q of [
      "ยาคุมฉุกเฉินกินหลังมีเพศสัมพันธ์ได้กี่ชั่วโมง",
      "ยาคุมฉุกเฉินกินภายในกี่ชั่วโมง",
      "ยาคุมฉุกเฉินต้องกินภายในกี่ชั่วโมง",
      "ยาคุมฉุกเฉินกินกี่ชั่วโมง",
      "กี่ชั่วโมงยาคุมฉุกเฉิน",
      "ยาคุมฉุกเฉินคืออะไร กินได้กี่ชั่วโมง",
    ]) {
      const r = retrieve(q, pool);
      expect(r.ranked[0]?.card.id, q).toBe("ec.timing.b001");
      expect(r.confident, q).toBe(true);
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

  it("crisis still overrides an EC timing/hour line, with no wait", async () => {
    const t = performance.now();
    const r = await runTurn(newDialog(), "อยากตาย ยาคุมฉุกเฉินกินกี่ชั่วโมง", deps());
    expect(performance.now() - t).toBeLessThan(50);
    expect(r.reply.kind).toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.categories).toContain("self_harm");
  });
});

describe("approved-card trigger regression", () => {
  it("fails on any card whose own triggers resolve elsewhere, and lists existing collisions", () => {
    const found = triggerMisroutes();
    expect(found.some((line) => line.startsWith("urgent.pills.000\t"))).toBe(false);
    expect(found, found.join("\n")).toEqual(EXISTING_TRIGGER_COLLISIONS);
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
  "กินยาคุมฉุกเฉินได้กี่ครั้ง",
  "กินยาคุมฉุกเฉินบ่อยอันตรายไหม",
  "กินยาคุมฉุกเฉินบ่อยๆได้ไหม",
  "กินยาคุมฉุกเฉินแล้วมีผลข้างเคียงไหม",
  "กินยาคุมฉุกเฉินอันตรายไหม",
  "กินยาคุมฉุกเฉินอันตราย",
  "กินยาคุมฉุกเฉินมีผลข้างเคียงไหม",
  "กินยาคุมฉุกเฉินมีผลข้างเคียง",
  "กินยาคุมฉุกเฉินบ่อย",
  "กินยาคุมฉุกเฉินได้กี่ครั้งครับ",
  "ยาคุมฉุกเฉินอันตรายไหมคะ",
  "ยาคุมฉุกเฉินกินได้กี่ครั้งค่ะ",
  "ยาคุมฉุกเฉินคืออะไรครับ",
  "ยาคุมฉุกเฉินกินหลังมีเพศสัมพันธ์ได้กี่ชั่วโมง",
  "ยาคุมฉุกเฉินกินภายในกี่ชั่วโมง",
  "ยาคุมฉุกเฉินต้องกินภายในกี่ชั่วโมง",
  "ยาคุมฉุกเฉินกินกี่ชั่วโมง",
  "กี่ชั่วโมงยาคุมฉุกเฉิน",
  "กี่วัน ยาคุมฉุกเฉิน",
  "ภายในกี่ชั่วโมงต้องกินยาคุมฉุกเฉิน",
  "ยาคุมฉุกเฉินหลังมีเพศสัมพันธ์นานแค่ไหน",
  "หลังมีเพศสัมพันธ์นานแค่ไหนยาคุมฉุกเฉิน",
  "ลืมกินยาคุมฉุกเฉิน",
  "กินยาคุมฉุกเฉินช้าไปไหม",
  "ยาคุมฉุกเฉินทันไหม",
  "ยาคุมฉุกเฉินยังทันไหม",
  "กี่ชั่วโมงหลังมีเพศสัมพันธ์กินยาคุมฉุกเฉินได้",
  "ยาคุมฉุกเฉินกี่ชั่วโมงค่ะ",
  "ยาคุมฉุกเฉินกินเมื่อไรคะ",
  "กินยาคุมฉุกเฉินช้าไปแล้วครับ",
  "ยาคุมฉุกเฉินคืออะไร กินได้กี่ชั่วโมง",
  "อยากรู้เรื่องยาคุมฉุกเฉิน กินภายในกี่ชั่วโมง",
  "ยาคุมฉุกเฉินทำงานยังไง ทันไหม",
  "ยาคุมฉุกเฉินคืออะไร หลังมีเพศสัมพันธ์นานแค่ไหน",
];

/** Intended diffs vs c450e1f: EC info → #21; กิน- how-often/danger/side-effect → #21; one timing line gained confidence. */
const INTENDED_VS_C450: Record<string, { id: string; conf: boolean }> = {
  "ยาคุมฉุกเฉินคืออะไร": { id: "urgent.pills.000", conf: true },
  "อยากรู้เรื่องยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินทำงานยังไง": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินคือ": { id: "urgent.pills.000", conf: true },
  "เรื่องยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินทำ": { id: "urgent.pills.000", conf: true },
  "คุมฉุกเฉิน": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินอันตราย": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินมีผลข้างเคียง": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินกินได้กี่ครั้ง": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "ยาคุมฉุกเฉินอันตรายไหม": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินมีผลข้างเคียงไหม": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินคืออะไรคะ": { id: "urgent.pills.000", conf: true },
  "เล่าเรื่องยาคุมฉุกเฉินให้หน่อย": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินทำอะไร": { id: "urgent.pills.000", conf: true },
  "ถุงยางรั่ว ต้องทำยังไง คุมฉุกเฉินทันไหม": { id: "ec.timing.b001", conf: true },
  "กินยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "กิน ยาคุมฉุกเฉิน": { id: "urgent.pills.000", conf: false },
  "กินยาคุมฉุกเฉินได้กี่ครั้ง": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินบ่อยอันตรายไหม": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินบ่อยๆได้ไหม": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินแล้วมีผลข้างเคียงไหม": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินอันตรายไหม": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินอันตราย": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินมีผลข้างเคียงไหม": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินมีผลข้างเคียง": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินบ่อย": { id: "urgent.pills.000", conf: true },
  "กินยาคุมฉุกเฉินได้กี่ครั้งครับ": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินอันตรายไหมคะ": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินกินได้กี่ครั้งค่ะ": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินคืออะไรครับ": { id: "urgent.pills.000", conf: true },
  "ยาคุมฉุกเฉินกินหลังมีเพศสัมพันธ์ได้กี่ชั่วโมง": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินกินภายในกี่ชั่วโมง": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินต้องกินภายในกี่ชั่วโมง": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินกินกี่ชั่วโมง": { id: "ec.timing.b001", conf: true },
  "กี่ชั่วโมงยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: true },
  "กี่วัน ยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: true },
  "ภายในกี่ชั่วโมงต้องกินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินหลังมีเพศสัมพันธ์นานแค่ไหน": { id: "ec.timing.b001", conf: true },
  "หลังมีเพศสัมพันธ์นานแค่ไหนยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: true },
  "ลืมกินยาคุมฉุกเฉิน": { id: "ec.timing.b001", conf: true },
  "กินยาคุมฉุกเฉินช้าไปไหม": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินทันไหม": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินยังทันไหม": { id: "ec.timing.b001", conf: true },
  "กี่ชั่วโมงหลังมีเพศสัมพันธ์กินยาคุมฉุกเฉินได้": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินกี่ชั่วโมงค่ะ": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินกินเมื่อไรคะ": { id: "ec.timing.b001", conf: true },
  "กินยาคุมฉุกเฉินช้าไปแล้วครับ": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินคืออะไร กินได้กี่ชั่วโมง": { id: "ec.timing.b001", conf: true },
  "อยากรู้เรื่องยาคุมฉุกเฉิน กินภายในกี่ชั่วโมง": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินทำงานยังไง ทันไหม": { id: "ec.timing.b001", conf: true },
  "ยาคุมฉุกเฉินคืออะไร หลังมีเพศสัมพันธ์นานแค่ไหน": { id: "ec.timing.b001", conf: true },
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
    const triggerQs = new Set<string>();
    for (const card of BANK) {
      if (card.review.status !== "approved") continue;
      if (card.id === FALLBACK_ID || card.id === WELCOME_ID) continue;
      for (const t of card.triggers) if (typeof t === "string") triggerQs.add(t);
    }
    const missing = [...triggerQs].filter((t) => !byQ.has(t));
    expect(missing, missing.join("\n")).toEqual([]);
    for (const q of CROSS_TOPIC) expect(byQ.has(q), q).toBe(true);
    expect(rows).toHaveLength(157);
    expect(rows).toHaveLength(new Set(rows.map((r) => r.q)).size);
  });

  it("every ec.timing trigger names an EC term", () => {
    const timing = BANK.find((c) => c.id === "ec.timing.b001")!;
    const bare: string[] = [];
    for (const t of timing.triggers) {
      if (typeof t === "string") {
        if (!EC_TERM.test(t)) bare.push(t);
      } else if (!t.all.some((tok) => EC_TERM.test(tok))) {
        bare.push(t.all.join("+"));
      }
    }
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
