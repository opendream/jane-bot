import { describe, it, expect } from "vitest";
import { ageAllowed, afterPick, isAdult, summaryAgeLabel, AGE_REDIRECT_CARD, AGE_REDIRECT_ID, AGE_REDIRECT_TEXT } from "../../src/core/age";
import type { BankCard } from "../../src/core/bank";

const adult: BankCard = { ...AGE_REDIRECT_CARD, id: "other.adult_only.000", age_min: 18, answer_th: "PLACEHOLDER · 18+", key_facts: ["18+"], reword: false };
const teen: BankCard = { ...AGE_REDIRECT_CARD, id: "other.teen.000", age_min: 15, answer_th: "PLACEHOLDER · 15+", key_facts: ["15+"] };

describe("D5 age states", () => {
  it.each([
    ["15-17", false, "อายุต่ำกว่า 18 ปี"],
    ["unspecified", false, "อายุต่ำกว่า 18 ปี"],
    [null, false, "อายุต่ำกว่า 18 ปี"],
    [undefined, false, "อายุต่ำกว่า 18 ปี"],
    ["18+", true, "18 ปีขึ้นไป"],
  ] as const)("%s → adult=%s summary=%s", (band, adultWant, label) => {
    expect(isAdult(band)).toBe(adultWant);
    expect(summaryAgeLabel(band)).toBe(label);
    expect(ageAllowed(adult, band)).toBe(adultWant);
    expect(ageAllowed(teen, band)).toBe(true);
  });

  it("afterPick redirects under-18 (and none / ไม่อยากบอก) off an 18+ card", () => {
    for (const band of ["15-17", "unspecified", null, undefined] as const) {
      expect(afterPick(adult, band, AGE_REDIRECT_CARD).id).toBe(AGE_REDIRECT_ID);
      expect(afterPick(teen, band, AGE_REDIRECT_CARD).id).toBe(teen.id);
    }
    expect(afterPick(adult, "18+", AGE_REDIRECT_CARD).id).toBe(adult.id);
  });

  it("redirect card is verbatim 15+ copy with 1663 and no reword", () => {
    expect(AGE_REDIRECT_CARD.answer_th).toBe(AGE_REDIRECT_TEXT);
    expect(AGE_REDIRECT_CARD.age_min).toBe(15);
    expect(AGE_REDIRECT_CARD.reword).toBe(false);
    expect(AGE_REDIRECT_CARD.answer_th).toContain("1663");
    expect(AGE_REDIRECT_CARD.referral.offer).not.toBe("none");
    expect(AGE_REDIRECT_CARD.licence).toContain("Opendream");
    expect(AGE_REDIRECT_CARD.licence).not.toContain("OpenDream");
  });
});
