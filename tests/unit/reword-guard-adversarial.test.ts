import { describe, it, expect } from "vitest";
import { acceptReword, rewordFailures } from "../../src/llm/rewordGuard";
import { bankContext, BANK } from "../../src/core/bankData";
import type { BankCard } from "../../src/core/bank";

// Hand-written adversarial rewords. SYNTHETIC only. Not generated from the PR mutator.
const ctx = bankContext(undefined, "draft", "2026-10-22");
const card = (id: string) => BANK.find((c) => c.id === id)!;
const mk = (id: string, answer_th: string, key_facts: string[]): BankCard => ({
  id, topic: "other", title_th: "ทดสอบ", answer_th, key_facts, triggers: [], next: [], source_intents: [], source: [],
  review: { status: "draft", reviewer: null, reviewed_on: null }, last_reviewed: null, flags: [], referral: { offer: "none", intents: [] },
  links: [], age_min: 15, reword: true, licence: "test-only",
});

function mustFallback(c: BankCard, out: string) {
  const r = acceptReword(c, out, ctx);
  expect(r.reworded, `accepted: ${out.slice(0, 80)}`).toBe(false);
  expect(r.text).toBe(c.answer_th);
  expect(rewordFailures(c, out, ctx).length).toBeGreaterThan(0);
}

describe("reword guard adversarial cases (not from the mutator)", () => {
  it("ปฏิเสธไม่ได้ on consent.p000 is not shown (negation after the verb)", () => {
    const c = card("consent.p000");
    mustFallback(c, c.answer_th.replace("ปฏิเสธเสมอ", "ปฏิเสธไม่ได้เสมอ"));
  });

  it("ไม่ต้องปรึกษาเภสัชกร on ec.p000 is not shown", () => {
    const c = card("ec.p000");
    mustFallback(c, c.answer_th.replace("ปรึกษาเภสัชกร", "ไม่ต้องปรึกษาเภสัชกร"));
  });

  it("a negation after the verb on a synthetic card is not shown", () => {
    const c = mk("t.adv.verb", "ข้อความทดสอบ เภสัชกรแนะนำให้ปรึกษาที่ร้านขายยา", ["เภสัชกร"]);
    mustFallback(c, "ข้อความทดสอบ เภสัชกรแนะนำให้ปรึกษาที่ร้านขายยาไม่ได้");
  });

  it("a removed negation is not shown", () => {
    const c = mk("t.adv.dropneg", "ข้อความทดสอบ คุณไม่ได้อยู่คนเดียว ลองคุยกับคนที่ไว้ใจ", ["ไม่ได้อยู่คนเดียว"]);
    mustFallback(c, "ข้อความทดสอบ คุณอยู่คนเดียว ลองคุยกับคนที่ไว้ใจ");
  });

  it("a far negation (more than 12 chars before a key fact) is not shown", () => {
    const c = mk("t.adv.far", "ข้อความทดสอบ ความรู้สึกแบบนี้เกิดขึ้นได้ คุณไม่ได้อยู่คนเดียว ลองคุยกับคนที่ไว้ใจดูนะ", ["ไม่ได้อยู่คนเดียว"]);
    mustFallback(c, "ข้อความทดสอบ ไม่ต้องรีบนะ ความรู้สึกแบบนี้เกิดขึ้นได้ คุณไม่ได้อยู่คนเดียว ลองคุยกับคนที่ไว้ใจ");
  });

  it("an added Thai number-word phrase on ec.p000 is not shown", () => {
    const c = card("ec.p000");
    mustFallback(c, `${c.answer_th} สองครั้งห่างกันสิบสองชั่วโมง`);
  });

  it("a number-word insertion on a synthetic hours card is not shown", () => {
    const c = mk("t.adv.numword", "ข้อความทดสอบ ยิ่งใช้เร็วยิ่งดี ภายใน 72 ชั่วโมง และถามเภสัชกรที่ร้านขายยาได้เลย", ["72 ชั่วโมง"]);
    mustFallback(c, `${c.answer_th} สองครั้งห่างกันสิบสองชั่วโมง`);
  });

  it("swapping 3 and 21 days is not shown", () => {
    const c = mk("t.adv.swap", "ข้อความทดสอบ กินต่อเนื่อง 21 วัน แล้วหยุด 3 วัน แล้วเริ่มใหม่", ["21 วัน", "3 วัน"]);
    mustFallback(c, "ข้อความทดสอบ กินต่อเนื่อง 3 วัน แล้วหยุด 21 วัน แล้วเริ่มใหม่");
  });

  it("ไม่ถึง 98% is not shown", () => {
    const c = mk("t.adv.pct", "ข้อความทดสอบ ถุงยางช่วยลดความเสี่ยงได้ เมื่อใช้อย่างถูกวิธี", ["ถุงยาง"]);
    mustFallback(c, `${c.answer_th} ไม่ถึง 98%`);
  });

  it("a unit swap is not shown", () => {
    const c = mk("t.adv.unit", "ข้อความทดสอบ ใช้ภายใน 72 ชั่วโมง ยิ่งเร็วยิ่งดี", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ ใช้ภายใน 72 วัน ยิ่งเร็วยิ่งดี");
  });

  it("a comparator change is not shown", () => {
    const c = mk("t.adv.comp", "ข้อความทดสอบ ใช้ภายใน 72 ชั่วโมง ยิ่งเร็วยิ่งดี", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ ใช้เกิน 72 ชั่วโมง ยิ่งเร็วยิ่งดี");
  });

  it("ยาคุมฉุกเฉินทำให้เป็นหมัน is not shown", () => {
    const c = card("ec.p000");
    mustFallback(c, `${c.answer_th} ยาคุมฉุกเฉินทำให้เป็นหมัน`);
  });

  it("ยาเหน็บ on pregnancy.p000 is not shown", () => {
    const c = card("pregnancy.p000");
    mustFallback(c, `${c.answer_th} ยาเหน็บ`);
  });

  it("a new medical term not in the denylist is not shown", () => {
    const c = mk("t.adv.term", "ข้อความทดสอบ กังวลเรื่องท้อง คุยกับเจ้าหน้าที่ได้", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th} ยาเหน็บ`);
  });
});
