import { describe, expect, it } from "vitest";
import { BANK } from "../../src/core/bankData";
import {
  CARD_THAI_NOTE_EN,
  CARD_THAI_NOTE_EN_STATUS,
  bankAnswerForLang,
  cardHasEnglish,
  cardNoteForLang,
  englishCardCoverage,
} from "../../src/core/card-lang";

describe("bank English coverage", () => {
  it("MEASURE: how many production bank cards have an English version", () => {
    const { withEnglish, total } = englishCardCoverage(BANK);
    expect(total).toBe(BANK.length);
    expect(withEnglish).toBeGreaterThanOrEqual(0);
    expect(withEnglish).toBeLessThanOrEqual(total);
    // Current bank has Thai bodies only (quiz.json en fields are not in BANK).
    expect(withEnglish).toBe(0);
  });

  it("detects any en field or variant", () => {
    expect(cardHasEnglish(BANK[0])).toBe(false);
    expect(cardHasEnglish({ ...BANK[0], title_en: "Birth control" })).toBe(true);
    expect(cardHasEnglish({ ...BANK[0], answer_en: "There are several methods." })).toBe(true);
    expect(cardHasEnglish({ ...BANK[0], variants_en: ["There are several methods."] })).toBe(true);
    expect(cardHasEnglish({ ...BANK[0], title_en: "  " })).toBe(false);
  });

  it("serves the English body when the bank has one, else Thai plus the DRAFT note", () => {
    const thai = BANK[0];
    expect(bankAnswerForLang(thai, "en")).toBe(thai.answer_th);
    expect(cardNoteForLang(thai, "en")).toBe(CARD_THAI_NOTE_EN);
    expect(cardNoteForLang(thai, "th")).toBeNull();
    expect(CARD_THAI_NOTE_EN_STATUS).toBe("draft");

    const enCard = { ...thai, answer_en: "SYNTHETIC English bank body." };
    expect(bankAnswerForLang(enCard, "en")).toBe("SYNTHETIC English bank body.");
    expect(cardNoteForLang(enCard, "en")).toBeNull();
    expect(bankAnswerForLang(enCard, "th")).toBe(thai.answer_th);
  });
});
