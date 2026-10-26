import { describe, it, expect } from "vitest";
// @ts-ignore
import { ageMinFromAudience, applyReviewRow, applyQuizReviewRow } from "../../scripts/bank/df-lib.mjs";

describe("review-pack audience → age_min", () => {
  it("All (15+) → 15 and 18+ only → 18", () => {
    expect(ageMinFromAudience("All (15+)", "Approved")).toBe(15);
    expect(ageMinFromAudience("18+ only", "Edit")).toBe(18);
    expect(applyReviewRow({ status: "Approved", audience: "All (15+)", card: { id: "x.000" } }).age_min).toBe(15);
    expect(applyReviewRow({ status: "Edit", audience: "18+ only", card: { id: "x.000" } }).age_min).toBe(18);
  });

  it("Approved or Edit with a blank audience fails the build (no default)", () => {
    for (const status of ["Approved", "Edit"]) {
      expect(() => ageMinFromAudience("", status)).toThrow(/audience/i);
      expect(() => ageMinFromAudience("   ", status)).toThrow(/audience/i);
      expect(() => ageMinFromAudience(null, status)).toThrow(/audience/i);
      expect(() => ageMinFromAudience(undefined, status)).toThrow(/audience/i);
      expect(() => applyReviewRow({ status, audience: "", card: { id: "x.000" } })).toThrow(/audience/i);
    }
  });

  it("Approved/Edit with only proposed_card keeps id, content and age_min", () => {
    const proposed_card = { id: "ec.p000", answer_th: "ข้อความทดสอบคุมฉุกเฉิน", flags: ["pii_checked"] };
    const built = applyReviewRow({ status: "Approved", audience: "18+ only", proposed_card });
    expect(built.id).toBe("ec.p000");
    expect(built.answer_th).toBe("ข้อความทดสอบคุมฉุกเฉิน");
    expect(built.flags).toEqual(["pii_checked"]);
    expect(built.age_min).toBe(18);
    const all15 = applyReviewRow({ status: "Edit", audience: "All (15+)", proposed_card });
    expect(all15).toMatchObject({ id: "ec.p000", answer_th: "ข้อความทดสอบคุมฉุกเฉิน", age_min: 15 });
  });

  it("the fixed redirect card general.age_redirect.000 is All (15+) even with a blank audience", () => {
    for (const status of ["Approved", "Edit"]) {
      const row = { status, audience: "", card: { id: "general.age_redirect.000", title_th: "สำหรับอายุ 18 ปีขึ้นไป" } };
      const built = applyReviewRow(row);
      expect(built.age_min).toBe(15);
      expect(built.id).toBe("general.age_redirect.000");
    }
    expect(applyReviewRow({ status: "Approved", audience: null, card: { id: "general.age_redirect.000" } }).age_min).toBe(15);
    expect(applyReviewRow({ status: "Approved", audience: "", proposed_card: { id: "general.age_redirect.000" } }).age_min).toBe(15);
    expect(() => applyReviewRow({ status: "Approved", audience: "", card: { id: "ec.p000" } })).toThrow(/audience/i);
  });

  it("Approved quiz row with a blank Audience fails the build (no default)", () => {
    expect(() => applyQuizReviewRow({ status: "Approved", audience: "", item: { id: "QZ-01" } })).toThrow(/audience/i);
    expect(() => applyQuizReviewRow({ status: "Edit", audience: "   ", item: { id: "QZ-04" } })).toThrow(/audience/i);
    expect(applyQuizReviewRow({ status: "Approved", audience: "18+ only", item: { id: "QZ-02" } }).age_min).toBe(18);
    expect(applyQuizReviewRow({ status: "Approved", audience: "All (15+)", item: { id: "QZ-01" } }).age_min).toBe(15);
  });
});
