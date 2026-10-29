import { describe, expect, it } from "vitest";
import { endsComplete, trimToLastCompleteSentence } from "../../src/llm/chat-trim";

// SYNTHETIC strings only.

describe("trimToLastCompleteSentence", () => {
  it("keeps a reply that already ends on a Thai particle", () => {
    expect(trimToLastCompleteSentence("พี่อยู่ตรงนี้นะ")).toBe("พี่อยู่ตรงนี้นะ");
    expect(trimToLastCompleteSentence("เล่าได้เลยค่ะ")).toBe("เล่าได้เลยค่ะ");
    expect(trimToLastCompleteSentence("เล่าได้เลยคะ")).toBe("เล่าได้เลยคะ");
    expect(trimToLastCompleteSentence("เล่าได้เลยครับ")).toBe("เล่าได้เลยครับ");
    expect(trimToLastCompleteSentence("เล่าได้เลยจ้ะ")).toBe("เล่าได้เลยจ้ะ");
    expect(trimToLastCompleteSentence("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย")).toBe("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย");
  });

  it("keeps a reply that ends on punctuation or a newline", () => {
    expect(trimToLastCompleteSentence("I'm here.")).toBe("I'm here.");
    expect(trimToLastCompleteSentence("พร้อมยัง?")).toBe("พร้อมยัง?");
    expect(trimToLastCompleteSentence("บรรทัดแรกนะ\n")).toBe("บรรทัดแรกนะ");
  });

  it("trims a mid-word cut-off back to the last complete sentence", () => {
    expect(trimToLastCompleteSentence("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่")).toBe("พี่อยู่ตรงนี้นะ");
    expect(trimToLastCompleteSentence("เล่าได้เลยค่ะ ไปอุ่")).toBe("เล่าได้เลยค่ะ");
    expect(trimToLastCompleteSentence("I'm here. You can tell me more whenev")).toBe("I'm here.");
    expect(trimToLastCompleteSentence("บรรทัดแรกนะ\nไปอุ่")).toBe("บรรทัดแรกนะ");
  });

  it("returns null when nothing complete is left", () => {
    expect(trimToLastCompleteSentence("น้องเล่าเพิ่")).toBeNull();
    expect(trimToLastCompleteSentence("Heat the cond")).toBeNull();
    expect(trimToLastCompleteSentence("")).toBeNull();
    expect(trimToLastCompleteSentence(null)).toBeNull();
  });

  it("treats elongated จ้า / น้า as complete endings", () => {
    expect(trimToLastCompleteSentence("อยู่ตรงนี้จ้าาา")).toBe("อยู่ตรงนี้จ้าาา");
    expect(endsComplete("อยู่ตรงนี้น้าา")).toBe(true);
  });

  it("does not treat คะ inside คะแนน as an ending", () => {
    expect(trimToLastCompleteSentence("ดูคะแนนรวมก่อน")).toBeNull();
  });
});
