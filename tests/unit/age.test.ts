import { describe, it, expect } from "vitest";
import { ageAllowed, afterPick, isAdult, summaryAgeLabel, AGE_REDIRECT_CARD, AGE_REDIRECT_ID, AGE_REDIRECT_TEXT } from "../../src/core/age";
import { draftSummaryForAge, pinnedAgeBand } from "../../src/core/summary-age";
import type { BankCard } from "../../src/core/bank";
import { SERVICES } from "../../src/core/referral";
import { draftSummary } from "../../src/core/summary";

const adult: BankCard = { ...AGE_REDIRECT_CARD, id: "other.adult_only.000", age_min: 18, answer_th: "ข้อความทดสอบสำหรับอายุ 18 ปีขึ้นไปเท่านั้น ไม่ใช่สายด่วน", key_facts: ["18 ปีขึ้นไป"], reword: false, flags: ["pii_checked"], referral: { offer: "none", intents: [] } };
const teen: BankCard = { ...AGE_REDIRECT_CARD, id: "other.teen.000", age_min: 15, answer_th: "ข้อความทดสอบสำหรับอายุ 15 ปีขึ้นไป", key_facts: ["15 ปีขึ้นไป"] };

describe("D5 age states (four bands; rule 21 splits at 18)", () => {
  it.each([
    ["15-17", false, "ต่ำกว่า 18 ปี"],
    ["unspecified", false, "ไม่ระบุ"],
    [null, false, "ไม่ระบุ"],
    [undefined, false, "ไม่ระบุ"],
    ["18+", true, "18 ปีขึ้นไป"],
    ["18-24", true, "18 ปีขึ้นไป"],
    ["25+", true, "18 ปีขึ้นไป"],
  ] as const)("%s → adult=%s summary=%s", (band, adultWant, label) => {
    expect(isAdult(band)).toBe(adultWant);
    expect(summaryAgeLabel(band)).toBe(label);
    expect(ageAllowed(adult, band)).toBe(adultWant);
    expect(ageAllowed(teen, band)).toBe(true);
  });

  it("afterPick redirects under-18 (and none / ไม่อยากบอก) off an 18+ card; 18–24 and 25+ see it", () => {
    for (const band of ["15-17", "unspecified", null, undefined] as const) {
      expect(afterPick(adult, band, AGE_REDIRECT_CARD).id).toBe(AGE_REDIRECT_ID);
      expect(afterPick(teen, band, AGE_REDIRECT_CARD).id).toBe(teen.id);
    }
    expect(afterPick(adult, "18+", AGE_REDIRECT_CARD).id).toBe(adult.id);
    expect(afterPick(adult, "18-24", AGE_REDIRECT_CARD).id).toBe(adult.id);
    expect(afterPick(adult, "25+", AGE_REDIRECT_CARD).id).toBe(adult.id);
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

  it("draftSummaryForAge rewrites the pinned age line without editing summary.ts", () => {
    const s1663 = SERVICES.find((s) => s.id === "hotline_1663")!;
    expect(pinnedAgeBand("15-17")).toBe("15-17");
    expect(pinnedAgeBand("18+")).toBe("18-24");
    expect(pinnedAgeBand("18-24")).toBe("18-24");
    expect(pinnedAgeBand("25+")).toBe("18-24");
    expect(pinnedAgeBand(null)).toBe("unspecified");
    const pinned = draftSummary({ service: s1663, needText: "กลัวท้อง", intent: "pregnancy", ageBand: "15-17" });
    expect(pinned).toContain("ช่วงอายุ: 15–17 ปี");
    const shown = draftSummaryForAge({ service: s1663, needText: "กลัวท้อง", intent: "pregnancy", ageBand: "15-17" });
    expect(shown).toContain("ช่วงอายุ: ต่ำกว่า 18 ปี");
    expect(shown).not.toContain("15–17");
    const skipped = draftSummaryForAge({ service: s1663, needText: "กลัวท้อง", intent: "pregnancy", ageBand: "unspecified" });
    const none = draftSummaryForAge({ service: s1663, needText: "กลัวท้อง", intent: "pregnancy", ageBand: null });
    expect(skipped).toContain("ช่วงอายุ: ไม่ระบุ");
    expect(none).toContain("ช่วงอายุ: ไม่ระบุ");
    expect(skipped).not.toContain("ต่ำกว่า 18 ปี");
    expect(isAdult("unspecified")).toBe(false);
    expect(ageAllowed(adult, "unspecified")).toBe(false);
    expect(ageAllowed(adult, null)).toBe(false);
    expect(draftSummaryForAge({ service: s1663, needText: "กลัวท้อง", intent: "pregnancy", ageBand: "18-24" })).toContain("ช่วงอายุ: 18 ปีขึ้นไป");
    expect(draftSummaryForAge({ service: s1663, needText: "กลัวท้อง", intent: "pregnancy", ageBand: "25+" })).toContain("ช่วงอายุ: 18 ปีขึ้นไป");
  });
});
