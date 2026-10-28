import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import data from "../../src/data/services.json";

// D3 (1663 hours) is pending: v2 work must not change any 1663 hours text or data.
const main = fs.readFileSync(path.resolve(__dirname, "../../src/main.ts"), "utf8");

describe("1663 hours are untouched while D3 is pending", () => {
  it("the under-15 and crisis-screen lines in main.ts are byte-identical to a8c58de", () => {
    expect(main).toContain('h("p", {}, "เรื่องท้องหรือเอชไอวี โทร 1663 (ทุกวัน 09:00–21:00 น.)"),');
    expect(main).toContain('h("p", {}, "ถ้ากำลังอยู่ในอันตรายตอนนี้ โทร 191 หรือ 1669 ทันที เรื่องท้องหรือเอชไอวีโทร 1663 (09:00–21:00 น.)"),');
  });
  it("services.json still cites both 1663 windows (RSATHAI 09:00–21:00, GCC 10:00–20:00)", () => {
    const s = (data.services as any[]).find((x) => x.id === "hotline_1663");
    expect(s.hours_sources.map((h: any) => `${h.by} ${h.hours.open}–${h.hours.close}`)).toEqual(["RSATHAI 09:00–21:00", "GCC Call Center ภาครัฐ 10:00–20:00"]);
  });
});
