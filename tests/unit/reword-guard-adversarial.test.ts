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

  it("more than one particle per sentence is not shown", () => {
    const c = mk("t.adv.cap", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th}นะค่ะจ้ะ`);
  });

  it.each(["ec.p000", "pregnancy.p000", "contraception.p000", "consent.p000"] as const)(
    "%s with แล้ว after ข้อความจริงรอผู้เชี่ยวชาญตรวจ falls back",
    (id) => {
      const c = card(id);
      mustFallback(c, c.answer_th.replace("ข้อความจริงรอผู้เชี่ยวชาญตรวจ", "ข้อความจริงรอผู้เชี่ยวชาญตรวจแล้ว"));
    },
  );

  it("…ไม่ถูกตัดสินแล้ว on pregnancy.p000 falls back", () => {
    const c = card("pregnancy.p000");
    mustFallback(c, c.answer_th.replace("ไม่ถูกตัดสิน", "ไม่ถูกตัดสินแล้ว"));
  });

  it("คุณมีสิทธิ์ปฏิเสธเสมอแล้ว on consent.p000 falls back", () => {
    const c = card("consent.p000");
    mustFallback(c, c.answer_th.replace("คุณมีสิทธิ์ปฏิเสธเสมอ", "คุณมีสิทธิ์ปฏิเสธเสมอแล้ว"));
  });

  it("แล้ว after a verb falls back", () => {
    const c = mk("t.adv.laewverb", "ข้อความทดสอบ ปรึกษาเภสัชกรที่ร้านขายยา", ["เภสัชกร"]);
    mustFallback(c, "ข้อความทดสอบ ปรึกษาแล้วเภสัชกรที่ร้านขายยา");
  });

  it("คะ at the end falls back", () => {
    const c = mk("t.adv.kha", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th}คะ`);
  });

  it("คุณมีสิทธิ์ปฏิเสธเสมอคะ? falls back (extra punctuation and คะ)", () => {
    const c = card("consent.p000");
    mustFallback(c, c.answer_th.replace("คุณมีสิทธิ์ปฏิเสธเสมอ", "คุณมีสิทธิ์ปฏิเสธเสมอคะ?"));
  });

  it("ec …ให้เร็วที่สุดคะ? falls back", () => {
    const c = card("ec.p000");
    mustFallback(c, c.answer_th.replace("ให้เร็วที่สุด", "ให้เร็วที่สุดคะ?"));
  });

  it("ec …ให้เร็วที่สุดนะ? falls back when the card has no ?", () => {
    const c = card("ec.p000");
    mustFallback(c, `${c.answer_th}นะ?`);
  });

  it("junk punctuation after an added particle falls back", () => {
    const c = mk("t.adv.junk", "ข้อความทดสอบ ตรวจภายใน 72 ชั่วโมง", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ ตรวจนะ\"\"))]] ภายใน 72 ชั่วโมง");
  });

  it("'ตรวจ แล้ว ตอนนี้…' falls back", () => {
    const c = card("ec.p000");
    mustFallback(c, c.answer_th.replace("ตรวจ ตอนนี้", "ตรวจ แล้ว ตอนนี้"));
  });

  it("'ไม่ แล้ว ต้องรอ' falls back", () => {
    const c = mk("t.adv.laewspace", "ข้อความทดสอบ ไม่ต้องรอผู้เชี่ยวชาญ", ["ผู้เชี่ยวชาญ"]);
    mustFallback(c, "ข้อความทดสอบ ไม่ แล้ว ต้องรอผู้เชี่ยวชาญ");
  });

  it("'ภายใน 72 นะ ชั่วโมง' falls back", () => {
    const c = mk("t.adv.numspace", "ข้อความทดสอบ ภายใน 72 ชั่วโมง", ["72 ชั่วโมง"]);
    mustFallback(c, "ข้อความทดสอบ ภายใน 72 นะ ชั่วโมง");
  });

  it("นะ at a mid-sentence space falls back", () => {
    const c = mk("t.adv.midspace", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้ เป็นความลับ", ["เจ้าหน้าที่"]);
    mustFallback(c, "ข้อความทดสอบนะ คุยกับเจ้าหน้าที่ได้ เป็นความลับ");
  });

  it("card text + นะ at the very end is accepted when the card has no trailing punctuation", () => {
    const c = mk("t.adv.endok", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้", ["เจ้าหน้าที่"]);
    const out = `${c.answer_th}นะ`;
    const r = acceptReword(c, out, ctx);
    expect(r.reworded).toBe(true);
    expect(r.text).toBe(out);
    expect(rewordFailures(c, out, ctx)).toEqual([]);
  });

  it("มีคำถามไหมนะ? ค่ะ falls back (particle before ? plus a second particle)", () => {
    const c = mk("t.r5.q", "มีคำถามไหม?", ["คำถาม"]);
    mustFallback(c, "มีคำถามไหมนะ? ค่ะ");
  });

  it("ไหม? ค่ะ then a line break falls back (particle after a mid-card mark)", () => {
    const c = mk("t.r5.nl", "ต้องรอผลตรวจก่อนไหม?\nไปหาหมอได้เลย", ["ตรวจ"]);
    mustFallback(c, "ต้องรอผลตรวจก่อนไหม? ค่ะ\nไปหาหมอได้เลย");
  });

  it("กลัวนะ!ค่ะ! falls back", () => {
    const c = mk("t.r5.bang", "กลัวนะ!", ["กลัว"]);
    mustFallback(c, "กลัวนะ!ค่ะ!");
  });

  it("คิดนะ…ค่ะ… falls back", () => {
    const c = mk("t.r5.ell", "คิดนะ…", ["คิด"]);
    mustFallback(c, "คิดนะ…ค่ะ…");
  });

  it("a particle at a mid-card mark falls back", () => {
    const c = mk("t.r5.midmark", "ข้อความทดสอบ ต้องรอไหม? ไปหาหมอได้", ["หมอ"]);
    mustFallback(c, "ข้อความทดสอบ ต้องรอไหม? ค่ะ ไปหาหมอได้");
  });

  it("two particles at the end of the card fall back", () => {
    const c = mk("t.r5.two", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th}นะค่ะ`);
  });

  it("a particle after a trailing ? falls back", () => {
    const c = mk("t.r5.afterq", "ข้อความทดสอบ ต้องรอไหม?", ["รอ"]);
    mustFallback(c, `${c.answer_th}นะ`);
    mustFallback(c, `${c.answer_th} นะ`);
  });

  it("a particle after a trailing ! falls back", () => {
    const c = mk("t.r5.afterbang", "ข้อความทดสอบ ระวัง!", ["ระวัง"]);
    mustFallback(c, `${c.answer_th}ค่ะ`);
  });

  it("a particle after a trailing … falls back", () => {
    const c = mk("t.r5.afterell", "ข้อความทดสอบ คิดดู…", ["คิด"]);
    mustFallback(c, `${c.answer_th}จ้ะ`);
  });

  it("a particle after a trailing period falls back", () => {
    const c = mk("t.r5.afterdot", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้.", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th}นะ`);
  });

  it("a particle after a trailing line break falls back", () => {
    const c = mk("t.r5.afternl", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้\n", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th}นะ`);
  });

  it("a particle followed by punctuation falls back", () => {
    const c = mk("t.r5.partpunct", "ข้อความทดสอบ คุยกับเจ้าหน้าที่ได้", ["เจ้าหน้าที่"]);
    mustFallback(c, `${c.answer_th}นะ?`);
    mustFallback(c, `${c.answer_th}ค่ะ!`);
    mustFallback(c, `${c.answer_th}จ้ะ.`);
  });
});


