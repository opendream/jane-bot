import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { shippable } from "../../src/core/bank";
import { retrieve } from "../../src/core/retrieve";
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

  it("the three card-#21 triggers are rules-confident", () => {
    for (const q of ["ยาคุมฉุกเฉินคืออะไร", "อยากรู้เรื่องยาคุมฉุกเฉิน", "ยาคุมฉุกเฉินทำงานยังไง"]) {
      const r = retrieve(q, pool);
      expect(r.confident, q).toBe(true);
      expect(r.ranked[0]?.card.id, q).toBe("urgent.pills.000");
      expect(r.ranked[0]!.score).toBeGreaterThan(r.ranked[1]?.score ?? 0);
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
];

/** Bare / generic EC → #21; one timing line gained confidence. Recorded vs c450e1f. */
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
    expect(missing, missing.join("\n")).toEqual([]);
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
