import { describe, expect, it } from "vitest";
import { BANK } from "../../src/core/bankData";
import { shippable } from "../../src/core/bank";
import {
  FACT_LCS_MIN,
  acceptChatFacts,
  chatFactCheckFailures,
  lcsCover,
  splitSentences,
  stripForLcs,
} from "../../src/llm/chat-factcheck";
import { endsComplete } from "../../src/llm/chat-trim";
import { FALLBACK_ID, WELCOME_ID } from "../../src/core/dialog";
import { extractNumberSpans } from "../../src/llm/chat-words";

// SYNTHETIC strings only.

const byId = (id: string) => {
  const c = BANK.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const CONDOM_LEAK = byId("condom.leak.000");
const PREP = byId("protection.prep.000");
const CONDOM = byId("condom.000");
const BIRTH = byId("birth.control.000");
const HIV = byId("disease.hiv.000");

const HEAT_BROKEN = "ถุงยางแตกแล้วให้นำไปอุ่นก่อนใช้นะ";
const PARENT_PREP_19 = "อายุสิบเก้าปีต้องมีผู้ปกครองไปด้วยถึงจะรับเพร็พได้นะ";

describe("must-reject: Codex round 1", () => {
  it("rejects heat-a-broken-condom against the leak card", () => {
    expect(acceptChatFacts(HEAT_BROKEN, CONDOM_LEAK.answer_th).ok).toBe(false);
  });

  it("rejects parent-needed-for-PrEP-at-19 against the PrEP card", () => {
    const reasons = chatFactCheckFailures(PARENT_PREP_19, PREP.answer_th);
    expect(reasons.length).toBeGreaterThan(0);
    expect(acceptChatFacts(PARENT_PREP_19, PREP.answer_th).ok).toBe(false);
  });

  it("rejects the English parent-at-19 line against the PrEP card", () => {
    expect(acceptChatFacts("A nineteen year old needs a parent present to get PrEP.", PREP.answer_th).ok).toBe(false);
  });

  it.each([
    "อายุสิบเก้าต้องให้คุณพ่อคุณแม่ไปด้วยนะคะ",
    "ต้องให้พ่อหรือแม่เซ็น",
    "ต้องพาผู้ใหญ่ไปด้วย",
  ])("rejects reworded PrEP permission %s", (reply) => {
    expect(acceptChatFacts(reply, PREP.answer_th).ok).toBe(false);
  });

  it("rejects double-condom-is-safer against the leak card", () => {
    expect(acceptChatFacts("ใส่ถุงยางสองชั้นจะปลอดภัยกว่านะคะ", CONDOM_LEAK.answer_th).ok).toBe(false);
  });

  it("rejects douching-with-soapy-water against the leak card", () => {
    expect(acceptChatFacts("สวนช่องคลอดด้วยน้ำสบู่", CONDOM_LEAK.answer_th).ok).toBe(false);
  });

  it("rejects drink-two-bottles against birth.control.000", () => {
    expect(acceptChatFacts("ดื่มยาคุมสองขวดนะ", BIRTH.answer_th).ok).toBe(false);
  });

  it("rejects invented PrEP age สิบเก้า with no unit", () => {
    expect(chatFactCheckFailures("อายุสิบเก้าถึงรับเพร็พได้นะ", PREP.answer_th).length).toBeGreaterThan(0);
    expect(acceptChatFacts("อายุสิบเก้าถึงรับเพร็พได้นะ", PREP.answer_th).ok).toBe(false);
  });

  it.each(["ไปศิริราชเลยนะ", "อยู่เชียงใหม่ได้นะ"])("rejects place name %s against the PrEP card", (reply) => {
    expect(acceptChatFacts(reply, PREP.answer_th).ok).toBe(false);
  });
});

describe("must-reject: Codex round 2", () => {
  it("rejects HIV polarity flip (disease.hiv.000)", () => {
    expect(acceptChatFacts("เชื้อเอชไอวีไม่สามารถติดต่อได้ทางเลือดนะคะ", HIV.answer_th).ok).toBe(false);
    expect(chatFactCheckFailures("เชื้อเอชไอวีไม่สามารถติดต่อได้ทางเลือดนะคะ", HIV.answer_th)).toContain("polarity");
  });

  it("rejects birth-control polarity flip (birth.control.000)", () => {
    expect(acceptChatFacts("ยาคุมกันโรคได้ค่ะ", BIRTH.answer_th).ok).toBe(false);
    expect(chatFactCheckFailures("ยาคุมกันโรคได้ค่ะ", BIRTH.answer_th)).toContain("polarity");
  });

  it("rejects PrEP polarity flip", () => {
    expect(acceptChatFacts("เพร็พไม่ต้องกินกันไว้ก่อนนะคะ", PREP.answer_th).ok).toBe(false);
    expect(chatFactCheckFailures("เพร็พไม่ต้องกินกันไว้ก่อนนะคะ", PREP.answer_th)).toContain("polarity");
  });

  it("rejects vaseline-as-lube against the leak card (condom.leak.000)", () => {
    expect(acceptChatFacts("ใช้วาสลีนเป็นสารหล่อลื่นได้นะคะ", CONDOM_LEAK.answer_th).ok).toBe(false);
  });

  it("rejects invented 3-in-4 on the PrEP card (สามในสี่ is a number)", () => {
    const reply = "เพร็พสามารถลดโอกาสในการติดเชื้อเอชไอวีได้สามในสี่ค่ะ";
    const reasons = chatFactCheckFailures(reply, PREP.answer_th);
    expect(reasons.length).toBeGreaterThan(0);
    expect(acceptChatFacts(reply, PREP.answer_th).ok).toBe(false);
  });
});

describe("must-pass: Codex-named faithful variants", () => {
  it("accepts เพร็พลดความเสี่ยงได้ค่ะ on the PrEP card", () => {
    expect(chatFactCheckFailures("เพร็พลดความเสี่ยงได้ค่ะ", PREP.answer_th)).toEqual([]);
    expect(acceptChatFacts("เพร็พลดความเสี่ยงได้ค่ะ", PREP.answer_th).ok).toBe(true);
  });

  it("accepts เพร็พช่วยลดความเสี่ยงได้ค่ะ on the PrEP card", () => {
    expect(chatFactCheckFailures("เพร็พช่วยลดความเสี่ยงได้ค่ะ", PREP.answer_th)).toEqual([]);
    expect(acceptChatFacts("เพร็พช่วยลดความเสี่ยงได้ค่ะ", PREP.answer_th).ok).toBe(true);
  });
});

describe("LCS threshold", () => {
  it("0.85 still accepts the ช่วย restatement and the closer เพร็พลดความเสี่ยงได้ค่ะ", () => {
    const first = splitSentences(PREP.answer_th)[0]!;
    const help = lcsCover("เพร็พช่วยลดความเสี่ยงได้ค่ะ", first);
    expect(help).toBeGreaterThanOrEqual(FACT_LCS_MIN);
    expect(FACT_LCS_MIN).toBe(0.85);
    expect(lcsCover("เพร็พลดความเสี่ยงได้ค่ะ", first)).toBeGreaterThanOrEqual(FACT_LCS_MIN);
  });
});

const PLANTS = [
  "รอสามวัน",
  "ไปที่โรงพยาบาล",
  "ราคาถูก",
  "เอากุงยางไปอุ่น",
  "ล้างด้วยสบู่",
  "สอดเข้าไป",
  "ทายาเอง",
  "กินยาแก้ปวด",
  "heat it first",
  "ต้องมีผู้ปกครองไปด้วย",
  "ต้องมีใบสั่งแพทย์",
  "need a parent there",
];

describe("generated planted facts against condom.000", () => {
  it.each(PLANTS)("rejects planted %s", (extra) => {
    const reply = `พี่อยู่ตรงนี้นะ ${extra}นะ`;
    expect(acceptChatFacts(reply, CONDOM.answer_th).ok, extra).toBe(false);
  });
});

describe("close restatements pass", () => {
  it("a card sentence plus an empathy opener is accepted", () => {
    const sent = splitSentences(CONDOM.answer_th)[0]!;
    expect(acceptChatFacts(`พี่เข้าใจ ${sent}`, CONDOM.answer_th).ok).toBe(true);
  });

  it("ทาน as a light verb swap on the PrEP first sentence still covers", () => {
    const reply = "เพร็พคือยาสำหรับลดความเสี่ยง HIV ทานไว้ก่อนมีกิจกรรมเสี่ยงนะ";
    expect(acceptChatFacts(reply, PREP.answer_th).ok).toBe(true);
  });

  it("clips of real first lines (digits stripped) pass the fact check", () => {
    const sample = [CONDOM, CONDOM_LEAK, BIRTH, PREP, byId("condom.how_to.000")];
    for (const card of sample) {
      const line = card.answer_th.split("\n")[0]!.replace(/[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*%?/g, "").trim();
      if (stripForLcs(line).length < 8) continue;
      const reply = endsComplete(line) ? line : `${line}นะ`;
      expect(chatFactCheckFailures(reply, card.answer_th), card.id).toEqual([]);
    }
  });
});

describe("no-card path", () => {
  it("accepts a short warm line with no factual claims", () => {
    expect(chatFactCheckFailures("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย", "")).toEqual([]);
  });

  it("accepts the no-card lines chat-system asks for", () => {
    expect(acceptChatFacts("พี่ยังตอบเรื่องนี้ไม่ได้ค่ะ กดขอข้อมูลเลยนะ", "").ok).toBe(true);
    expect(acceptChatFacts("ขอโทษนะ พี่ยังตอบเรื่องนี้ไม่ได้", "").ok).toBe(true);
    expect(acceptChatFacts("น้องซักถามได้เลยนะ", "").ok).toBe(true);
    expect(acceptChatFacts("ทางนี้พี่เข้าใจนะ", "").ok).toBe(true);
    expect(acceptChatFacts("ลองเล่ามานะ", "").ok).toBe(true);
    expect(acceptChatFacts("อยากฟังนะ", "").ok).toBe(true);
  });

  it("rejects planted facts and the old allowlist hole เพิ่มอีกได้นะคะ", () => {
    expect(acceptChatFacts("รอสามวันนะ", "").ok).toBe(false);
    expect(acceptChatFacts("เอากุงยางไปอุ่นนะ", "").ok).toBe(false);
    expect(acceptChatFacts("ต้องมีผู้ปกครองนะ", "").ok).toBe(false);
    expect(acceptChatFacts("เพิ่มอีกได้นะคะ", "").ok).toBe(false);
  });
});

const TOPIC_SWAP: readonly (readonly [string, string])[] = [
  ["ยาคุมกำเนิด", "ถุงยาง"],
  ["ยาคุม", "ถุงยาง"],
  ["ถุงยางอนามัย", "ยาคุม"],
  ["ถุงยาง", "ยาคุม"],
  ["เพร็พ", "ยาคุม"],
  ["เอชไอวี", "ถุงยาง"],
  ["prep", "ยาคุม"],
  ["hiv", "ถุงยาง"],
];

function polarityFlip(sent: string): string {
  return /อย่า/.test(sent) ? `ห้าม ${sent}` : `อย่า ${sent}`;
}

function numberChange(sent: string): string {
  const spans = extractNumberSpans(sent);
  const existing = new Set(spans.map((s) => s.value));
  const pick = [3, 4, 7, 11, 19].find((n) => !existing.has(n)) ?? 42;
  const word: Record<number, string> = {
    3: "สาม", 4: "สี่", 7: "เจ็ด", 11: "สิบเอ็ด", 19: "สิบเก้า", 42: "สี่สิบสอง",
  };
  const replacement = word[pick]!;
  if (spans.length) {
    const first = spans[0]!;
    return `${sent.slice(0, first.start)}${replacement}${sent.slice(first.end)}`;
  }
  const mid = Math.max(1, Math.floor(sent.length / 2));
  return `${sent.slice(0, mid)} ${replacement} ${sent.slice(mid)}`;
}

function topicSwap(sent: string): string {
  const lower = sent.toLowerCase();
  const add = ["เพร็พ", "ยาคุม", "ถุงยาง", "เอชไอวี"].find((t) => !lower.includes(t.toLowerCase())) ?? "ห่วงอนามัย";
  const sorted = [...TOPIC_SWAP].sort((a, b) => b[0].length - a[0].length);
  for (const [from] of sorted) {
    const i = lower.indexOf(from.toLowerCase());
    if (i >= 0 && from.toLowerCase() !== add.toLowerCase()) {
      return sent.slice(0, i) + add + sent.slice(i + from.length);
    }
  }
  return `${add} ${sent}`;
}

const GEN_CARDS = BANK.filter((c) => shippable(c, "draft") && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);

describe("generated per card-sentence: polarity / number / topic / light rewording", () => {
  for (const card of GEN_CARDS) {
    const sentences = splitSentences(card.answer_th).filter((s) => stripForLcs(s).length >= 12);
    if (!sentences.length) continue;
    describe(card.id, () => {
      it.each(sentences)("rejects a polarity flip of %s", (sent) => {
        expect(acceptChatFacts(polarityFlip(sent), card.answer_th).ok, sent).toBe(false);
      });
      it.each(sentences)("rejects a number change of %s", (sent) => {
        expect(acceptChatFacts(numberChange(sent), card.answer_th).ok, sent).toBe(false);
      });
      it.each(sentences)("rejects a topic swap of %s", (sent) => {
        expect(acceptChatFacts(topicSwap(sent), card.answer_th).ok, sent).toBe(false);
      });
      it.each(sentences)("accepts empathy opener plus the card sentence %s", (sent) => {
        expect(acceptChatFacts(`พี่เข้าใจ ${sent}`, card.answer_th).ok, sent).toBe(true);
      });
    });
  }
});
