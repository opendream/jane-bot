import { describe, expect, it } from "vitest";
import {
  CHAT_EMPATHY_PHRASES_EN,
  CHAT_EMPATHY_PHRASES_TH,
  CHAT_EMPATHY_STATUS,
} from "../../src/llm/chat-factcheck-empathy";
import { wordList } from "../../src/llm/chat-words";

const FORBIDDEN = [
  "พ่อ", "แม่", "ผู้ปกครอง", "อุ่น", "ต้ม", "ล้าง", "สอด", "ทา", "กิน",
  "เม็ด", "โดส", "ปี", "บาท", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า",
  "one", "two", "three", "parent", "hospital", "98", "90",
];

describe("DRAFT empathy phrase list", () => {
  it("is marked DRAFT and holds whole phrases, not single words", () => {
    expect(CHAT_EMPATHY_STATUS).toBe("draft");
    expect(CHAT_EMPATHY_PHRASES_TH.length).toBeGreaterThan(8);
    expect(CHAT_EMPATHY_PHRASES_TH.length).toBeLessThan(40);
    for (const p of CHAT_EMPATHY_PHRASES_TH) {
      expect(p.trim()).toBe(p);
      expect(p.length).toBeGreaterThan(3);
    }
    expect(CHAT_EMPATHY_PHRASES_TH).toContain("พี่เข้าใจ");
    expect(CHAT_EMPATHY_PHRASES_TH).toContain("ไม่ต้องกังวล");
    expect(CHAT_EMPATHY_PHRASES_TH).toContain("ขอบคุณที่ถามมา");
    expect(CHAT_EMPATHY_PHRASES_TH).toContain("ขอโทษนะ พี่ยังตอบเรื่องนี้ไม่ได้");
    expect(CHAT_EMPATHY_PHRASES_TH).toContain("กดขอข้อมูลเลย");
    expect(CHAT_EMPATHY_PHRASES_EN).toContain("i'm here");
  });

  it("contains no facts, instructions, quantities, or numbers", () => {
    const phrases = [...CHAT_EMPATHY_PHRASES_TH, ...CHAT_EMPATHY_PHRASES_EN];
    for (const p of phrases) {
      expect(p).not.toMatch(/[0-9๐-๙]/);
      for (const w of wordList(p)) {
        expect(FORBIDDEN, p).not.toContain(w.normalize("NFC").toLowerCase());
      }
    }
  });
});
