import { describe, expect, it } from "vitest";
import {
  CHAT_FOLLOWUPS_EN,
  CHAT_FOLLOWUPS_TH,
  CHAT_OPENERS_EN,
  CHAT_OPENERS_TH,
  CHAT_VOICE_STATUS,
} from "../../src/llm/chat-voice";

const FORBIDDEN = [
  "พ่อ", "แม่", "ผู้ปกครอง", "อุ่น", "ต้ม", "ล้าง", "สอด", "กิน",
  "เม็ด", "โดส", "ปี", "บาท", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า",
  "ยาคุม", "ถุงยาง", "เพร็พ", "เอชไอวี", "prep", "hiv",
  "one", "two", "three", "parent", "hospital", "98", "90",
  "pill", "dose", "condom",
];

/** Reassurance, minimising, or a verdict about risk. Openers must stay acknowledgement / thanks. */
const REASSURANCE = [
  "กังวล", "เซฟ", "ปลอดภัย", "ไม่เป็นไร", "ไม่เสี่ยง",
  "ไม่ต้องห่วง", "สบายใจ", "ไม่ต้องกลัว", "มั่นใจได้",
  "worry", "worried", "don't worry", "dont worry",
  "safe", "it's okay", "it's ok", "no risk", "risk-free",
  "you'll be fine", "no need to worry",
];

describe("DRAFT opener and follow-up lists", () => {
  it("is marked DRAFT and holds whole phrases, not free-text slots", () => {
    expect(CHAT_VOICE_STATUS).toBe("draft");
    expect(CHAT_OPENERS_TH.length).toBe(4);
    expect(CHAT_FOLLOWUPS_TH.length).toBe(4);
    expect(CHAT_OPENERS_TH[0]).toBe("เราอยู่ตรงนี้นะคะ");
    for (const p of [...CHAT_OPENERS_TH, ...CHAT_FOLLOWUPS_TH, ...CHAT_OPENERS_EN, ...CHAT_FOLLOWUPS_EN]) {
      expect(p.trim()).toBe(p);
      expect(p.length).toBeGreaterThan(3);
    }
  });

  it("follow-ups are questions with no facts, numbers, drug or method names, or advice", () => {
    for (const q of CHAT_FOLLOWUPS_TH) {
      expect(q.includes("?") || q.includes("ไหม") || q.includes("มั้ย") || q.endsWith("ดี")).toBe(true);
      expect(q).not.toMatch(/ควร|ต้องกิน|ห้าม/);
    }
    for (const q of CHAT_FOLLOWUPS_EN) {
      expect(q.endsWith("?")).toBe(true);
    }
  });

  it("contains no facts, instructions, quantities, or numbers", () => {
    const phrases = [...CHAT_OPENERS_TH, ...CHAT_FOLLOWUPS_TH, ...CHAT_OPENERS_EN, ...CHAT_FOLLOWUPS_EN];
    for (const p of phrases) {
      expect(p, p).not.toMatch(/[0-9๐-๙]/);
      const lower = p.toLowerCase();
      for (const w of FORBIDDEN) {
        expect(lower.includes(w.toLowerCase()), `${p} / ${w}`).toBe(false);
      }
    }
  });

  it("no opener or follow-up contains a reassurance, minimising, or risk-verdict word", () => {
    const phrases = [...CHAT_OPENERS_TH, ...CHAT_FOLLOWUPS_TH, ...CHAT_OPENERS_EN, ...CHAT_FOLLOWUPS_EN];
    for (const p of phrases) {
      const lower = p.toLowerCase();
      for (const w of REASSURANCE) {
        expect(lower.includes(w.toLowerCase()), `${p} / ${w}`).toBe(false);
      }
    }
    expect(CHAT_OPENERS_TH).not.toContain("ไม่ต้องกังวล");
  });
});
