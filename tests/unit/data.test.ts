import { describe, it, expect } from "vitest";
import { SERVICES } from "../../src/core/referral";
import { PREFERENCE } from "../../src/core/referral";

describe("services.json integrity", () => {
  it("every service has https sources with check dates and valid hours", () => {
    for (const s of SERVICES) {
      expect(s.sources.length, s.id).toBeGreaterThan(0);
      for (const src of s.sources) {
        expect(src.url).toMatch(/^https:\/\//);
        expect(src.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      if (s.hours.type === "daily") {
        expect(s.hours.open).toMatch(/^\d{2}:\d{2}$/);
        expect(s.hours.close).toMatch(/^\d{2}:\d{2}$/);
      }
      if (s.verification !== "verified") expect(s.verification_note, s.id).toBeTruthy();
    }
  });
  it("every preferred id exists", () => {
    const ids = new Set(SERVICES.map((s) => s.id));
    for (const list of Object.values(PREFERENCE)) for (const id of list) expect(ids.has(id), id).toBe(true);
  });
});
