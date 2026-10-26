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

describe("reword guard adversarial cases: reorder, deletion, role and particle placement", () => {
  it("ec.p000 'ตอนนี้แนะนำให้รอ' is not shown (recombination)", () => {
    const c = card("ec.p000");
    mustFallback(c, `${c.answer_th.split("ตอนนี้")[0]}ตอนนี้แนะนำให้รอ`);
  });

  it("ec.p000 'ยาคุมฉุกเฉินไม่ใช่ยาป้องกันการตั้งครรภ์ เป็นยาทำแท้ง' is not shown", () => {
    const c = card("ec.p000");
    mustFallback(c, "ยาคุมฉุกเฉินไม่ใช่ยาป้องกันการตั้งครรภ์ เป็นยาทำแท้ง");
  });

  it("consent.p000 'มีสิทธิ์ปฏิเสธคุณเสมอ' is not shown (role swap)", () => {
    const c = card("consent.p000");
    mustFallback(c, c.answer_th.replace("คุณมีสิทธิ์ปฏิเสธเสมอ", "มีสิทธิ์ปฏิเสธคุณเสมอ"));
  });

  it("consent.p000 'ถ้าคุณบังคับแฟน' is not shown", () => {
    const c = card("consent.p000");
    mustFallback(c, `${c.answer_th.split("คุณมี")[0]}ถ้าคุณบังคับแฟน`);
  });

  it("ec.p000 with รีบ and ให้เร็วที่สุด dropped is not shown", () => {
    const c = card("ec.p000");
    mustFallback(c, c.answer_th.replace("รีบ", "").replace("ให้เร็วที่สุด", "").replace(/\s+/g, " ").trim());
  });

  it("pregnancy.p000 'โดยไม่กังวล ถูกตัดสินได้' is not shown (negation moved)", () => {
    const c = card("pregnancy.p000");
    mustFallback(c, c.answer_th.replace("โดยไม่ถูกตัดสิน", "โดยไม่กังวล ถูกตัดสินได้"));
  });

  it("pregnancy.p000 'ที่ไม่ได้เสี่ยงท้องและโรค ป้องกัน' is not shown (negation moved)", () => {
    const c = card("pregnancy.p000");
    mustFallback(c, `${c.answer_th} ที่ไม่ได้เสี่ยงท้องและโรค ป้องกัน`.replace("โดยไม่ถูกตัดสิน", ""));
  });

  it("a deletion of a clause is not shown", () => {
    const c = mk("t.adv.del", "ข้อความทดสอบ ใช้ยาภายใน 72 ชั่วโมง แล้วตรวจใน 21 วัน", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ ใช้ยาภายใน 72 ชั่วโมง");
  });

  it("a reorder of clauses is not shown", () => {
    const c = mk("t.adv.reord", "ข้อความทดสอบ ใช้ยาภายใน 72 ชั่วโมง แล้วตรวจใน 21 วัน", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ แล้วตรวจใน 21 วัน ใช้ยาภายใน 72 ชั่วโมง");
  });

  it("a role swap on a synthetic card is not shown", () => {
    const c = mk("t.adv.role", "ข้อความทดสอบ คุณมีสิทธิ์ปฏิเสธเสมอ", ["ปฏิเสธ"]);
    mustFallback(c, "ข้อความทดสอบ มีสิทธิ์ปฏิเสธคุณเสมอ");
  });

  it("a negation moved onto another verb is not shown", () => {
    const c = mk("t.adv.negmove", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้โดยไม่ถูกตัดสิน", ["เจ้าหน้าที่"]);
    mustFallback(c, "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้โดยไม่กังวล ถูกตัดสิน");
  });

  it("swapping the 72-hour and 21-day windows between clauses is not shown", () => {
    const c = mk("t.adv.clauseNum", "ข้อความทดสอบ ใช้ยาภายใน 72 ชั่วโมง และตรวจใน 21 วัน", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ ใช้ยาภายใน 21 วัน และตรวจใน 72 ชั่วโมง");
  });

  it("a particle inside a word is not shown", () => {
    const c = mk("t.adv.inside", "ข้อความทดสอบ ร้านขายยาใกล้บ้าน", ["ร้านขายยา"]);
    mustFallback(c, "ข้อความทดสอบ ร้านนะขายยาใกล้บ้าน");
  });

  it("inserting แล้ว before a verb is not shown", () => {
    const c = mk("t.adv.then", "ข้อความทดสอบ ใช้ภายใน 72 ชั่วโมง ยิ่งเร็วยิ่งดี", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ แล้วใช้ภายใน 72 ชั่วโมง ยิ่งเร็วยิ่งดี");
  });

  it("inserting เลย before a verb is not shown", () => {
    const c = mk("t.adv.loei", "ข้อความทดสอบ ปรึกษาเภสัชกรที่ร้านขายยา", ["เภสัชกร"]);
    mustFallback(c, "ข้อความทดสอบ เลยปรึกษาเภสัชกรที่ร้านขายยา");
  });

  it("more than two particles in one sentence is not shown", () => {
    const c = mk("t.adv.cap", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th}นะค่ะจ้ะ`);
  });
});
