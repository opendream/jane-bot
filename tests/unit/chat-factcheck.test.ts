import { describe, expect, it } from "vitest";
import { BANK } from "../../src/core/bankData";
import { chatFactCheckFailures, acceptChatFacts } from "../../src/llm/chat-factcheck";
import { endsComplete } from "../../src/llm/chat-trim";

// SYNTHETIC strings only. Must-reject lines are the phone-test wrong facts.

const byId = (id: string) => {
  const c = BANK.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const CONDOM_LEAK = byId("condom.leak.000");
const PREP = byId("protection.prep.000");
const CONDOM = byId("condom.000");
const BIRTH = byId("birth.control.000");

/** Heat-a-broken-condom: the arm A phone-test failure. */
const HEAT_BROKEN = "ถุงยางแตกแล้วให้นำไปอุ่นก่อนใช้นะ";
/** Parent-needed-for-PrEP-at-19: the arm B phone-test failure. No digits (chatGuard already rejects those). */
const PARENT_PREP_19 = "อายุสิบเก้าปีต้องมีผู้ปกครองไปด้วยถึงจะรับเพร็พได้นะ";

describe("must-reject regressions", () => {
  it("rejects heat-a-broken-condom against the leak card", () => {
    expect(chatFactCheckFailures(HEAT_BROKEN, CONDOM_LEAK.answer_th)).toContain("instruction");
    expect(acceptChatFacts(HEAT_BROKEN, CONDOM_LEAK.answer_th).ok).toBe(false);
  });

  it("rejects parent-needed-for-PrEP-at-19 against the PrEP card", () => {
    const reasons = chatFactCheckFailures(PARENT_PREP_19, PREP.answer_th);
    expect(reasons).toContain("permission");
    expect(reasons).toContain("quantity");
    expect(acceptChatFacts(PARENT_PREP_19, PREP.answer_th).ok).toBe(false);
  });

  it("rejects the English parent-at-19 line against the PrEP card", () => {
    expect(chatFactCheckFailures("A nineteen year old needs a parent present to get PrEP.", PREP.answer_th))
      .toContain("permission");
  });

  // Codex HIGH 1: reworded permission claims (no ผู้ปกครอง / parent token).
  it.each([
    "อายุสิบเก้าต้องให้คุณพ่อคุณแม่ไปด้วยนะคะ",
    "ต้องให้พ่อหรือแม่เซ็น",
    "ต้องพาผู้ใหญ่ไปด้วย",
  ])("rejects reworded PrEP permission %s", (reply) => {
    expect(acceptChatFacts(reply, PREP.answer_th).ok).toBe(false);
  });

  // Codex HIGH 2: invented instructions / units, including verb-group leaks.
  it("rejects double-condom-is-safer against the leak card", () => {
    expect(acceptChatFacts("ใส่ถุงยางสองชั้นจะปลอดภัยกว่านะคะ", CONDOM_LEAK.answer_th).ok).toBe(false);
  });

  it("rejects douching-with-soapy-water against the leak card (ล้าง on the card is not a free pass)", () => {
    expect(acceptChatFacts("สวนช่องคลอดด้วยน้ำสบู่", CONDOM_LEAK.answer_th).ok).toBe(false);
  });

  it("rejects drink-two-bottles against birth.control.000", () => {
    expect(acceptChatFacts("ดื่มยาคุมสองขวดนะ", BIRTH.answer_th).ok).toBe(false);
  });

  // Codex HIGH 3: Thai number word invents an age limit with no unit beside it.
  it("rejects invented PrEP age สิบเก้า with no unit", () => {
    const reasons = chatFactCheckFailures("อายุสิบเก้าถึงรับเพร็พได้นะ", PREP.answer_th);
    expect(reasons).toContain("quantity");
    expect(acceptChatFacts("อายุสิบเก้าถึงรับเพร็พได้นะ", PREP.answer_th).ok).toBe(false);
  });

  // Codex MEDIUM 7: named hospitals and provinces.
  it.each(["ไปศิริราชเลยนะ", "อยู่เชียงใหม่ได้นะ"])("rejects place name %s against the PrEP card", (reply) => {
    expect(acceptChatFacts(reply, PREP.answer_th).ok).toBe(false);
  });
});

const PLANTS: { extra: string; reason: "quantity" | "instruction" | "permission" }[] = [
  { extra: "รอสามวัน", reason: "quantity" },
  { extra: "ไปที่โรงพยาบาล", reason: "quantity" },
  { extra: "ราคาถูก", reason: "quantity" },
  { extra: "เอากุงยางไปอุ่น", reason: "instruction" },
  { extra: "ล้างด้วยสบู่", reason: "instruction" },
  { extra: "สอดเข้าไป", reason: "instruction" },
  { extra: "ทายาเอง", reason: "coverage" },
  { extra: "กินยาแก้ปวด", reason: "instruction" },
  { extra: "heat it first", reason: "instruction" },
  { extra: "ต้องมีผู้ปกครองไปด้วย", reason: "permission" },
  { extra: "ต้องมีใบสั่งแพทย์", reason: "permission" },
  { extra: "need a parent there", reason: "permission" },
];

describe("generated planted facts against condom.000", () => {
  it.each(PLANTS)("rejects $reason planted as $extra", ({ extra, reason }) => {
    const reply = `พี่อยู่ตรงนี้นะ ${extra}นะ`;
    expect(chatFactCheckFailures(reply, CONDOM.answer_th), extra).toContain(reason);
    expect(acceptChatFacts(reply, CONDOM.answer_th).ok).toBe(false);
  });
});

const FAITHFUL: { id: string; reply: string }[] = [
  {
    id: "condom.000",
    reply: "ถุงยางกันได้ทั้งท้องและโรค ถ้าใช้ถูกวิธีก็เวิร์กเลย",
  },
  {
    id: "condom.000",
    reply: "ถุงยางกันได้ทั้งเรื่องท้องและเรื่องโรคเลย",
  },
  {
    id: "condom.000",
    reply: "ถ้าใช้อย่างถูกวิธี ถุงยางเวิร์กสุดแล้วนะ",
  },
  {
    id: "condom.leak.000",
    reply: "ถุงยางแตกได้หลายสาเหตุ เช่น ไซส์ไม่พอดี ใกล้ความร้อน หรือหมดอายุ ถ้าแตกให้หยุด ล้าง แล้วเปลี่ยนถุงใหม่นะ",
  },
  {
    id: "condom.leak.000",
    reply: "ถุงยางแตกได้หลายสาเหตุ เช่น ไซส์ไม่พอดี หรือหมดอายุนะ",
  },
  {
    id: "condom.leak.000",
    reply: "ถ้าแตกควรหยุด ไปล้างแล้วเปลี่ยนถุงอันใหม่นะ",
  },
  {
    id: "birth.control.000",
    reply: "ยาคุมกันท้องได้แต่กันโรคไม่ได้นะ",
  },
  {
    id: "birth.control.000",
    reply: "ยาคุมกันท้องได้ แต่ยังกันโรคไม่ได้นะ",
  },
  {
    id: "birth.control.000",
    reply: "ยาคุมกำเนิดมีให้เลือกหลายประเภทเลย",
  },
  {
    id: "protection.prep.000",
    reply: "เพร็พคือยาลดความเสี่ยง HIV กินไว้ก่อนมีกิจกรรมเสี่ยงนะ",
  },
  {
    id: "protection.prep.000",
    reply: "เพร็พคือยาสำหรับลดความเสี่ยง HIV ทานไว้ก่อนมีกิจกรรมเสี่ยงนะ",
  },
  {
    id: "protection.prep.000",
    reply: "คนไทยทุกคนรับเพร็พฟรีได้ที่หน่วยบริการนะ",
  },
];

describe("false-positive: faithful paraphrases of real cards pass", () => {
  it.each(FAITHFUL)("$id paraphrase is accepted: $reply", ({ id, reply }) => {
    const card = byId(id);
    expect(chatFactCheckFailures(reply, card.answer_th), reply).toEqual([]);
    expect(acceptChatFacts(reply, card.answer_th).ok).toBe(true);
  });

  it("does not false-reject ทาน / ทาง / ซักถาม via Thai substring (Codex MEDIUM 4)", () => {
    expect(acceptChatFacts("เพร็พคือยาสำหรับลดความเสี่ยง HIV ทานไว้ก่อนมีกิจกรรมเสี่ยงนะ", PREP.answer_th).ok).toBe(true);
    expect(acceptChatFacts("น้องซักถามได้เลยนะ", "").ok).toBe(true);
    expect(chatFactCheckFailures("ทางนี้พี่เข้าใจนะ", "")).toEqual([]);
  });

  it("clips of real first lines (digits stripped) pass the fact check", () => {
    const sample = [CONDOM, CONDOM_LEAK, BIRTH, PREP, byId("condom.how_to.000")];
    for (const card of sample) {
      const line = card.answer_th.split("\n")[0]!.replace(/[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*%?/g, "").trim();
      if (line.length < 8) continue;
      const reply = endsComplete(line) ? line : `${line}นะ`;
      expect(chatFactCheckFailures(reply, card.answer_th), card.id).toEqual([]);
    }
  });
});

describe("no-card path", () => {
  it("accepts a short warm line with no factual claims", () => {
    expect(chatFactCheckFailures("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย", "")).toEqual([]);
  });

  it("rejects planted facts when no card matched", () => {
    expect(chatFactCheckFailures("รอสามวันนะ", "")).toContain("quantity");
    expect(chatFactCheckFailures("เอากุงยางไปอุ่นนะ", "")).toContain("instruction");
    expect(chatFactCheckFailures("ต้องมีผู้ปกครองนะ", "")).toContain("permission");
  });
});
