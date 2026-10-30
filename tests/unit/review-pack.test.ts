import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { FALLBACK_ID, WELCOME_ID } from "../../src/core/dialog";
import { AGE_REDIRECT_TEXT, isAdult, type AgePick } from "../../src/core/age";
import { QUIZ_ITEMS } from "../../src/core/quiz";
import { THAI_COPY_STATUS } from "../../src/config";

/** Byte-exact strings from Keng's 27 Oct 2026 review pack (Edits). Not the Notion dump. */
const FALLBACK_TEXT = "ตอนนี้เจนยังไม่สามารถตอบเรื่องนั้นได้ค่ะ";
const A5 = "ถ้าเพิ่งติดเชื้อ อาจมีอาการผิดปกติน้อย และอาการนั้นสามารถหายไปเองได้ใน 2-4 อาทิตย์ เช่น เจ็บคอ ปวดเมื่อยกล้ามเนื้อ มีไข้ต่ำๆ อ่อนเพลีย น้ำหนักลดเล็กน้อย ถ่ายอุจจาระเหลว ต่อมน้ำเหลืองโต ดังนั้นเพื่อให้ชัวร์ ควรไปตรวจจะดีกว่า\nคนไทยทุกคน ทุกสิทธิ ตรวจเอชไอวีฟรีปีละ 2 ครั้ง จะไปตรวจที่หน่วยบริการในระบบ สปสช. เช่น โรงพยาบาลรัฐใกล้บ้าน (ใช้บัตรประชาชน) หรือตรวจด้วยตัวเองด้วยชุดตรวจ HIV Self-Test ก็ได้ ถ้าผลเป็นบวก ต้องไปตรวจยืนยันที่โรงพยาบาลนะ\nถ้าอยากตรวจแบบไม่แจ้งชื่อ มีคลินิกนิรนาม แต่อาจมีค่าใช้จ่าย สอบถามคลินิกก่อนนะ\nหรือจะโทรปรึกษาสายด่วน 1663 ก่อนก็ได้ ปรึกษาฟรี ทุกวัน 09:00–21:00 น. รวมวันหยุด";
const A28 = "สำหรับคนที่ต้องการทำแท้งอย่างปลอดภัยและถูกกฎหมาย ให้ลองติดต่อไปที่เครือข่ายอาสา RSA หรือเครือข่ายอาสาเพื่อยุติการตั้งครรภ์ที่ปลอดภัย ของกระทรวงสาธารณสุข เขามีหน่วยบริการยุติการตั้งครรภ์อยู่ทั่วประเทศ ลองค้นคำว่า \"เครือข่าย RSA\" เพื่อหาหน่วยบริการใกล้บ้านได้เลย";
const A34 = "วัยรุ่นอายุ 13–18 ปี ตรวจเอชไอวีได้เองโดยไม่ต้องให้ผู้ปกครองยินยอม ถ้าเข้าใจว่าการตรวจคืออะไรและผลตรวจหมายถึงอะไร (แนวทางกรมควบคุมโรค 2021/22)";
const A21 = [
  "อยากรู้เรื่องยาคุมฉุกเฉินใช่มั้ย",
  "ยาคุมฉุกเฉินเป็นฮอร์โมนสังเคราะห์ขนาดสูง ทำงานหลักๆ โดยยับยั้งหรือชะลอการตกไข่ ไข่เลยไม่เจอกับอสุจิ แต่ถ้าตั้งครรภ์ไปแล้ว ยานี้จะไม่ทำให้แท้งนะ",
  "ยิ่งกินเร็วหลังมีเพศสัมพันธ์ที่ไม่ได้ป้องกัน ยิ่งได้ผลดี",
  "คำว่าฉุกเฉินคือใช้ตอนฉุกเฉินจริงๆ นะ เพราะป้องกันได้ไม่ดีเท่ายาคุมแบบปกติหรือถุงยาง และอาจทำให้ประจำเดือนมาไม่ตรงหรือมีเลือดออกกะปริดกะปรอยได้ ถ้าต้องใช้บ่อยๆ ลองปรึกษาเรื่องวิธีคุมกำเนิดแบบประจำดีกว่า",
].join("\n");
const A1 = "สวัสดี เราชื่อเจน :D";
const A33 = "สงสัยอะไรก็มาคุยกันใหม่น้าาา";
const CHT03 = "ขอบคุณที่คุยกันนะ ถ้าอยากคุยกับคนจริง กดปุ่มคุยกับเจ้าหน้าที่ได้ และลบแชทได้ทุกเมื่อ";

const byId = (id: string) => BANK.find((c) => c.id === id);

describe("review pack decisions (Keng, 27 Oct 2026)", () => {
  it("THAI_COPY_STATUS is reviewed and every shipped card is approved, not a placeholder", () => {
    expect(THAI_COPY_STATUS).toBe("reviewed");
    expect(BANK).toHaveLength(35);
    for (const c of BANK) {
      expect(c.placeholder, c.id).toBeFalsy();
      expect(c.review.status, c.id).toBe("approved");
      expect(c.answer_th, c.id).not.toContain("PLACEHOLDER");
    }
  });

  it("Drops are absent: #32 talkadmin, and no leftover placeholder ids", () => {
    const ids = BANK.map((c) => c.id);
    expect(ids).not.toContain("default.ending.talkadmin");
    expect(ids.some((id) => id.includes("talkadmin"))).toBe(false);
    expect(BANK.some((c) => c.answer_th.includes("พี่เจนขอส่งต่อให้แอด"))).toBe(false);
    expect(ids).not.toContain("ec.p000");
    expect(ids).not.toContain("pregnancy.p000");
    expect(ids).not.toContain("mental_health.p000");
    expect(ids).not.toContain("consent.p000");
    expect(ids).not.toContain("contraception.p000");
    expect(ids).not.toContain("sti_hiv.p000");
    expect(ids).not.toContain("ending.bye.p000");
    expect(ids).toContain("ec.timing.b001");
    expect(ids).toContain("ending.staff.000");
  });

  it("CHT-03 talk-to-staff keeps the existing SVC referral offer (not #32)", () => {
    const staff = byId("ending.staff.000")!;
    expect(staff.referral.offer).toBe("strong");
    expect(staff.referral.intents).toEqual(["other"]);
    expect(staff.answer_th).toBe(CHT03);
  });

  it("Edits are present byte-exact: #2/#5/#21/#28/#34; #21 is Audience All (15+)", () => {
    expect(byId(FALLBACK_ID)?.answer_th).toBe(FALLBACK_TEXT);
    expect(byId("disease.hiv.002")?.answer_th).toBe(A5);
    expect(byId("disease.hiv.002")?.answer_th).not.toContain("เป๋าตัง");
    expect(byId("disease.hiv.002")?.answer_th).not.toContain("@standbyyou");
    const a21 = BANK.find((c) => c.source_intents.includes("20200708.urgent.pills.0000"));
    expect(a21?.answer_th).toBe(A21);
    expect(a21?.age_min).toBe(15);
    expect(byId("pregnancy.abortion.003")?.answer_th).toBe(A28);
    expect(byId("pregnancy.abortion.003")?.answer_th).not.toContain("→");
    expect(byId("hiv.test.under18.000")?.answer_th).toBe(A34);
    expect(byId("hiv.test.under18.000")?.answer_th).not.toMatch(/Option A|Cite DDC/);
    expect(byId(WELCOME_ID)?.answer_th).toBe(A1);
    expect(byId("ending.byejane.000")?.answer_th).toBe(A33);
    expect(byId("ending.staff.000")?.answer_th).toBe(CHT03);
  });

  it("#21 ships Edit All (15+); no implantation/2-pack, no dose, no hour window, no EC price", () => {
    const c = BANK.find((x) => x.source_intents.includes("20200708.urgent.pills.0000"))!;
    expect(c.answer_th).toBe(A21);
    expect(c.age_min).toBe(15);
    expect(c.answer_th).not.toContain("ไม่ควรกินเกิน 2 แผงในรอบ 1 เดือน");
    expect(c.answer_th).not.toContain("ขัดขวางไม่ให้ไข่ที่ผสมกับอสุจิแล้วไปฝังตัว");
    expect(c.answer_th).not.toMatch(/บาท/);
    expect(c.answer_th).not.toMatch(/72\s*ชั่วโมง|120\s*(ชม|ชั่วโมง)|1\.5\s*mg/);
    expect(BANK.some((x) => x.answer_th.includes("ไม่ควรกินเกิน 2 แผงในรอบ 1 เดือน"))).toBe(false);
    expect(BANK.some((x) => x.answer_th.includes("ขัดขวางไม่ให้ไข่ที่ผสมกับอสุจิแล้วไปฝังตัว"))).toBe(false);
  });

  it("fallback is one reply with a เริ่มใหม่ chip and no extra variants or referral offer", () => {
    const fb = byId(FALLBACK_ID)!;
    expect(fb.answer_th).toBe(FALLBACK_TEXT);
    expect(fb.answer_th).not.toContain("ปุ่ม:");
    expect(fb.variants_th ?? []).toEqual([]);
    expect(fb.referral.offer).toBe("none");
    expect(fb.next).toEqual([{ label_th: "เริ่มใหม่", card_id: WELCOME_ID }]);
    expect(BANK.filter((c) => c.id === FALLBACK_ID || c.source_intents.includes("Default Fallback Intent"))).toHaveLength(1);
  });

  it("four start-screen age bands; rule 21 still splits at 18", () => {
    const bands: AgePick[] = ["15-17", "18-24", "25+", "unspecified"];
    expect(bands).toHaveLength(4);
    expect(isAdult("15-17")).toBe(false);
    expect(isAdult("unspecified")).toBe(false);
    expect(isAdult("18-24")).toBe(true);
    expect(isAdult("25+")).toBe(true);
    expect(isAdult("18+")).toBe(true);
    expect(AGE_REDIRECT_TEXT).toContain("18 ปีขึ้นไป");
    expect(AGE_REDIRECT_TEXT).toContain("1663");
  });

  it("quiz: all seven approved, All (15+), including QZ-07", () => {
    expect(QUIZ_ITEMS).toHaveLength(7);
    for (const q of QUIZ_ITEMS) {
      expect(q.status, q.id).toBe("approved");
      expect(q.age_min, q.id).toBe(15);
      expect(q.decision, q.id).toBe("Approve");
    }
    expect(QUIZ_ITEMS.map((q) => q.id)).toContain("QZ-07");
  });

  it("dosing cards #12 #13 #19 #22 still carry their dose lines", () => {
    expect(byId("protection.prep.000")?.answer_th).toContain("กินวันละ 1 เม็ด");
    expect(byId("protection.pep.000")?.answer_th).toContain("28 วัน");
    expect(byId("birth.control.pills.000")?.answer_th).toContain("21 เม็ด");
    expect(byId("ec.timing.b001")?.answer_th).toContain("72 ชั่วโมง");
  });
});
