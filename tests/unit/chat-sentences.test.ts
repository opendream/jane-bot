import { describe, expect, it } from "vitest";
import { BANK, BANK_FIXTURES } from "../../src/core/bankData";
import { numberedCardSentences, splitCardSentences } from "../../src/llm/chat-sentences";

function collapseWs(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

describe("splitCardSentences (deterministic, conditions stay attached)", () => {
  it("keeps the 98% condom line attached to ถ้าใช้อย่างถูกวิธี", () => {
    const card = BANK.find((c) => c.id === "condom.000")!;
    const sentences = splitCardSentences(card.answer_th);
    expect(sentences.some((s) => /98%/.test(s) && !s.includes("ถ้าใช้อย่างถูกวิธี"))).toBe(false);
    const withPct = sentences.find((s) => /98%/.test(s));
    expect(withPct).toBeTruthy();
    expect(withPct).toContain("ถ้าใช้อย่างถูกวิธี");
  });

  it("keeps the เช่น list on condom.leak.000 attached to its introducer", () => {
    const card = BANK.find((c) => c.id === "condom.leak.000")!;
    const sentences = splitCardSentences(card.answer_th);
    const withVaseline = sentences.find((s) => s.includes("วาสลีน"));
    expect(withVaseline).toBeTruthy();
    expect(withVaseline).toContain("เช่น");
    expect(withVaseline).toContain("ถุงยางแตกนี่มีหลายสาเหตุ");
  });

  it("does not split a one-paragraph card", () => {
    const card = BANK.find((c) => c.id === "disease.hiv.001")!;
    expect(card.answer_th.includes("\n")).toBe(false);
    expect(splitCardSentences(card.answer_th)).toEqual([card.answer_th.trim()]);
  });

  it("is stable: the same input always yields the same ids", () => {
    for (const card of BANK) {
      expect(splitCardSentences(card.answer_th)).toEqual(splitCardSentences(card.answer_th));
    }
  });

  it("every production card's sentences join back to answer_th (whitespace aside)", () => {
    expect(BANK.length).toBeGreaterThan(10);
    for (const card of BANK) {
      const sentences = splitCardSentences(card.answer_th);
      expect(sentences.length, card.id).toBeGreaterThan(0);
      expect(collapseWs(sentences.join(" ")), card.id).toBe(collapseWs(card.answer_th));
      for (const s of sentences) {
        expect(card.answer_th, card.id).toContain(s);
      }
    }
  });

  it("every fixture card's sentences join back to answer_th (whitespace aside)", () => {
    for (const card of BANK_FIXTURES) {
      const sentences = splitCardSentences(card.answer_th);
      expect(sentences.length, card.id).toBeGreaterThan(0);
      expect(collapseWs(sentences.join(" ")), card.id).toBe(collapseWs(card.answer_th));
    }
  });

  it("numbers the sentences with stable 0-based ids", () => {
    const block = numberedCardSentences("แรก\nถ้าสอง");
    expect(block).toBe("0. แรก\nถ้าสอง");
  });
});
