import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import data from "../../src/data/services.json";
import { SERVICES, serviceHoursLabel } from "../../src/core/referral";
import { hoursCitation, hoursLabel } from "../../src/core/openNow";

const s1663 = (data.services as any[]).find((x) => x.id === "hotline_1663")!;
const svc = SERVICES.find((s) => s.id === "hotline_1663")!;
const expected = { type: "daily", open: "09:00", close: "21:00" };
const expectedLabel = "ทุกวัน 09:00–21:00 น.";
const src = (...names: string[]) => path.resolve(__dirname, ...names);
const read = (...names: string[]) => fs.readFileSync(src(...names), "utf8");

describe("D3: 1663 hours 09:00–21:00, operator cited first", () => {
  it("services.json is 09:00–21:00 daily; operator, then RSATHAI, then NHSO; no GCC window", () => {
    expect(s1663.hours_sources).toHaveLength(3);
    expect(s1663.hours_sources.map((h: any) => h.hours)).toEqual([expected, expected, expected]);
    expect(s1663.hours_sources.map((h: any) => h.by)).toEqual(["ศูนย์วิจัยโรคเอดส์ สภากาชาดไทย", "RSATHAI", "NHSO"]);
    expect(s1663.hours_sources[0].url).toMatch(/th\.aidsid\.or\.th\/consulting-service/);
    expect(s1663.hours_sources[1].url).toMatch(/rsathai\.org/);
    expect(s1663.hours_sources[2].url).toMatch(/nhso\.go\.th/);
    expect(s1663.hours_sources.every((h: any) => h.checked === "2026-10-22")).toBe(true);
    expect(s1663.sources.map((x: any) => x.url)).toEqual(s1663.hours_sources.map((h: any) => h.url));
    expect(s1663.description_th).not.toMatch(/โทรฟรี|สายฟรี/);
    expect(s1663.description_th).toContain("ปรึกษาฟรี");
    expect(s1663.description_th).not.toMatch(/ศูนย์วิจัยโรคเอดส์|สภากาชาดไทย|โดย/);
    const hoursFields = { ...s1663 };
    delete (hoursFields as { verification_note?: string }).verification_note;
    const blob = JSON.stringify(hoursFields);
    expect(blob).not.toMatch(/GCC|gcontact\.gcc|10:00|20:00|10–20|10-20/);
  });

  it("every place 1663 hours appear agrees with services.json, operator first", () => {
    expect(svc.hours).toEqual(expected);
    expect(hoursLabel(svc.hours)).toBe(expectedLabel);
    expect(serviceHoursLabel("hotline_1663")).toBe(expectedLabel);
    const c = hoursCitation(svc);
    expect(c.conflict).toBe(false);
    expect(c.conflict_note_th).toBeNull();
    expect(c.effective_th).toBe(expectedLabel);
    expect(c.lines).toHaveLength(3);
    expect(c.lines[0]).toMatch(/^ศูนย์วิจัยโรคเอดส์ สภากาชาดไทย: ทุกวัน 09:00–21:00 น\. · th\.aidsid\.or\.th\/consulting-service · ตรวจ 2026-10-22$/);
    expect(c.lines[1]).toBe("RSATHAI: ทุกวัน 09:00–21:00 น. · rsathai.org/qrcode · ตรวจ 2026-10-22");
    expect(c.lines[2]).toMatch(/^NHSO: ทุกวัน 09:00–21:00 น\. · nhso\.go\.th\/th\/communicate-th\/thnewsforperson\/2025-09-03-07-16-57 · ตรวจ 2026-10-22$/);
    const main = read("../../src/main.ts");
    expect(main).toContain('serviceHoursLabel("hotline_1663")');
    expect(main).not.toMatch(/โทร 1663 \((ทุกวัน )?09:00–21:00/);
    expect(main).not.toMatch(/1663.{0,80}10:00/);
    const stale = /10:00–20:00|10:00-20:00|10–20|10-20/;
    const leftovers = ["src", "tests", "README.md"].flatMap((root) => {
      const walk = (p: string): string[] => {
        if (fs.statSync(p).isDirectory()) {
          return fs.readdirSync(p).filter((n) => !n.startsWith(".") && n !== "node_modules").flatMap((n) => walk(path.join(p, n)));
        }
        return /\.(?:ts|json|md|mjs)$/.test(p) ? [p] : [];
      };
      return walk(src("../..", root));
    }).flatMap((f) => {
      if (f.endsWith("hours-d3.test.ts")) return [];
      const lines = fs.readFileSync(f, "utf8").split("\n");
      return lines.flatMap((line, i) => {
        if (!stale.test(line)) return [];
        const near = lines.slice(Math.max(0, i - 4), i + 5).join("\n");
        return /1663/.test(near) ? [`${path.relative(src("../.."), f)}:${i + 1}`] : [];
      });
    });
    expect(leftovers, leftovers.join("\n")).toEqual([]);
  });
});
