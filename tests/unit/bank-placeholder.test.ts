import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { hoursIn, PLACEHOLDER_MARK, visibleStrings } from "../../src/core/bank";
import { FALLBACK_ID, WELCOME_ID } from "../../src/core/dialog";

describe("committed bank cards (reviewed)", () => {
  it("every committed card is approved, non-placeholder copy", () => {
    expect(BANK.length).toBeGreaterThan(0);
    for (const c of BANK) {
      expect(c.placeholder, c.id).toBeFalsy();
      expect(c.answer_th.includes(PLACEHOLDER_MARK), c.id).toBe(false);
      expect(c.review.status, c.id).toBe("approved");
      expect(c.licence, c.id).toBe("CC-BY-SA-4.0");
    }
  });
  it("1663 hours on a card match the cited 09:00–21:00 window", () => {
    for (const c of BANK) {
      if (!visibleStrings(c).some((t) => t.includes("1663"))) continue;
      for (const h of visibleStrings(c).flatMap(hoursIn)) expect(h, c.id).toBe("09:00–21:00");
    }
  });
  it("a welcome, a fallback and an ending card exist", () => {
    const ids = BANK.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([WELCOME_ID, FALLBACK_ID]));
    expect(BANK.some((c) => c.topic === "ending")).toBe(true);
  });
});
