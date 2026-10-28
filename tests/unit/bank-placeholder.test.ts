import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { hoursIn, PLACEHOLDER_MARK, visibleStrings } from "../../src/core/bank";

describe("committed bank cards (placeholders until review)", () => {
  it("every committed card is a clearly marked, unapproved PLACEHOLDER", () => {
    expect(BANK.length).toBeGreaterThan(0);
    for (const c of BANK) {
      expect(c.placeholder, c.id).toBe(true);
      expect(c.answer_th.startsWith(PLACEHOLDER_MARK), c.id).toBe(true);
      expect(c.review.status, c.id).toBe("draft");
      expect(c.licence, c.id).toMatch(/not ThaiHealth content/);
    }
  });
  it("no card states opening hours for 1663 (hours live in services.json)", () => {
    for (const c of BANK) if (visibleStrings(c).some((t) => t.includes("1663"))) expect(visibleStrings(c).flatMap(hoursIn), c.id).toEqual([]);
  });
  it("a welcome, a fallback and an ending card exist", () => {
    const ids = BANK.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["general.welcome.000", "general.fallback.000"]));
    expect(BANK.some((c) => c.topic === "ending")).toBe(true);
  });
});
