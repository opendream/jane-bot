import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import data from "../../src/data/services.json";
import { PREFERENCE, SERVICES, suggestServices, canPrepareMessage } from "../../src/core/referral";
import { hoursCitation, hoursLabel, isOpenAt, narrowestHours, openStatus } from "../../src/core/openNow";
import { draftSummary } from "../../src/core/summary";

const root = path.resolve(__dirname, "../..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bankFiles = fs.readdirSync(path.join(root, "src/data/bank"))
  .filter((n) => n.endsWith(".json"))
  .map((n) => path.join("src/data/bank", n));
const scanned = ["src/data/services.json", "src/main.ts", "src/ui/chat.ts", "src/core/referral.ts", ...bankFiles];

function windowsAround(text: string, needle: string, radius: number): string[] {
  const out: string[] = [];
  let from = 0;
  while (from < text.length) {
    const i = text.indexOf(needle, from);
    if (i < 0) break;
    out.push(text.slice(Math.max(0, i - radius), Math.min(text.length, i + needle.length + radius)));
    from = i + needle.length;
  }
  return out;
}

describe("fact-check (23 Oct 2026)", () => {
  it("(a) 1663 is never a free call (โทรฟรี / สายฟรี / ฟรี 24)", () => {
    for (const f of scanned) {
      const text = read(f);
      for (const win of windowsAround(text, "1663", 40)) {
        expect(win, `${f}: ${win}`).not.toMatch(/โทรฟรี|สายฟรี|ฟรี 24/);
      }
    }
  });

  it("(b) 1300 and ศูนย์พึ่งได้ are separate; OSCC has no phone or clock times", () => {
    const s1300 = (data.services as any[]).find((s) => s.id === "hotline_1300");
    const oscc = (data.services as any[]).find((s) => s.id === "oscc_hospital");
    expect(s1300).toBeTruthy();
    expect(oscc).toBeTruthy();
    expect(s1300.id).not.toBe(oscc.id);
    expect(JSON.stringify(s1300)).not.toContain("ศูนย์พึ่งได้");
    expect(JSON.stringify(oscc)).not.toMatch(/1300/);
    expect(oscc.channels.every((c: { type: string }) => c.type !== "phone")).toBe(true);
    expect(oscc.channels.some((c: { type: string }) => c.type === "in_person")).toBe(true);
    expect(JSON.stringify(oscc)).not.toMatch(/\d{1,2}[:.]\d{2}/);
    expect(PREFERENCE.violence).toEqual(["hotline_1300", "hotline_1323", "oscc_hospital", "teen_club"]);
    for (const f of scanned) expect(read(f)).not.toContain("(OSCC) สายด่วน 1300");
  });

  it("(c) no 191 line claims sexual violence", () => {
    for (const f of scanned) {
      for (const line of read(f).split("\n")) {
        if (!line.includes("191")) continue;
        expect(line, `${f}: ${line}`).not.toMatch(/ทางเพศ|ข่มขืน|ล่วงละเมิด/);
      }
    }
  });

  it("(d) no EC/PrEP prices and no under-18 / guardian rule", () => {
    for (const f of scanned) {
      const text = read(f);
      for (const term of ["ยาคุมฉุกเฉิน", "PrEP", "เพร็พ"]) {
        for (const win of windowsAround(text, term, 40)) {
          expect(win, `${f}: ${win}`).not.toMatch(/บาท/);
        }
      }
      expect(text, f).not.toMatch(/ผู้ปกครอง/);
      expect(text, f).not.toMatch(/อายุต่ำกว่า\s*18|under-?18|ไม่ต้องมีผู้ปกครอง/i);
    }
  });

  it("(e) unpublished hours: unknown status, hospital label, no clock times", () => {
    const un = { type: "unpublished" as const };
    expect(isOpenAt(un, 12 * 60)).toBeNull();
    expect(openStatus(un).state).toBe("unknown");
    expect(openStatus(un).label_th).toBe("ไม่ระบุเวลาเปิด");
    expect(hoursLabel(un)).toBe("ไม่ระบุเวลาเปิด สอบถามที่โรงพยาบาล");
    expect(hoursLabel(un)).not.toMatch(/\d{1,2}[:.]\d{2}/);
    expect(narrowestHours([un])).toEqual(un);
    expect(narrowestHours([un, { type: "varies" }])).toEqual({ type: "varies" });
    const oscc = SERVICES.find((s) => s.id === "oscc_hospital")!;
    expect(oscc.hours).toEqual(un);
    expect(openStatus(oscc.hours).state).toBe("unknown");
    expect(hoursLabel(oscc.hours)).toBe("ไม่ระบุเวลาเปิด สอบถามที่โรงพยาบาล");
    expect(oscc.channels[0].type).toBe("in_person");
    expect(oscc.channels[0].label_th).toBe("ติดต่อศูนย์พึ่งได้ที่โรงพยาบาลรัฐใกล้บ้าน");
  });

  it("(f) a violence query gives separate 1300 and ศูนย์พึ่งได้ cards", () => {
    const cards = suggestServices(["violence"], new Date("2026-10-22T10:00:00+07:00"));
    const ids = cards.map((c) => c.service.id);
    expect(ids).toContain("hotline_1300");
    expect(ids).toContain("oscc_hospital");
    const a = cards.find((c) => c.service.id === "hotline_1300")!.service;
    const b = cards.find((c) => c.service.id === "oscc_hospital")!.service;
    expect(a.name_th).not.toContain("ศูนย์พึ่งได้");
    expect(b.name_th).toContain("ศูนย์พึ่งได้");
    expect(a.description_th).not.toContain("ศูนย์พึ่งได้");
  });

  it("(g) no 1663 string names an operator", () => {
    const s1663 = (data.services as any[]).find((s) => s.id === "hotline_1663")!;
    const blob = JSON.stringify(s1663);
    expect(blob).not.toMatch(/สภากาชาด|เข้าถึงเอดส์/);
    for (const line of hoursCitation(s1663).lines) expect(line).not.toMatch(/สภากาชาด|เข้าถึงเอดส์/);
    const files = ["src/main.ts", "src/ui/chat.ts", "src/core/referral.ts", ...bankFiles];
    for (const f of files) {
      const text = read(f);
      for (const win of windowsAround(text, "1663", 200)) {
        expect(win, `${f}: ${win}`).not.toMatch(/สภากาชาด|เข้าถึงเอดส์/);
      }
    }
  });

  it("(h) no female-officer / s.133 line on cards (absent on 2fe35a3)", () => {
    for (const f of scanned) {
      const text = read(f);
      expect(text, f).not.toMatch(/พนักงานสอบสวนหญิง/);
      expect(text, f).not.toMatch(/crisis-female-officer/);
      expect(text, f).not.toMatch(/มาตรา\s*133|ส\.?\s*133|CrPC\s*s\.?\s*133/i);
    }
  });

  it("(j) 1663 copy has ปรึกษาฟรี and daily hours, never รวมวันหยุด; สปสช. does not cover ฟรี or กด 2", () => {
    const s1663 = (data.services as any[]).find((s) => s.id === "hotline_1663")!;
    expect(JSON.stringify(s1663)).not.toContain("รวมวันหยุด");
    expect(s1663.description_th).toContain("ปรึกษาฟรี");
    expect(s1663.description_th).toContain("09:00–21:00");
    const main = read("src/main.ts");
    expect(main).not.toMatch(/1663[\s\S]{0,120}รวมวันหยุด|รวมวันหยุด[\s\S]{0,80}1663/);
    for (const win of windowsAround(main, "1663", 80)) {
      expect(win, win).not.toContain("รวมวันหยุด");
    }
    const nhsoEnd = s1663.description_th.indexOf("(ข้อมูล สปสช.)");
    expect(nhsoEnd).toBeGreaterThan(0);
    const nhsoClaim = s1663.description_th.slice(0, nhsoEnd);
    expect(nhsoClaim).toContain("กด 1");
    expect(nhsoClaim).not.toMatch(/ปรึกษาฟรี|กด 2/);
    expect(s1663.description_th).toMatch(/กด 2[\s\S]{0,40}ข้อมูล กรมประชาสัมพันธ์/);
    expect(s1663.description_th).toMatch(/ปรึกษาฟรี[\s\S]{0,40}ข้อมูล กรมประชาสัมพันธ์/);
    const prd = s1663.sources.find((x: { url: string }) => /prd\.go\.th/.test(x.url))!;
    expect(prd.title).toContain("ให้คำปรึกษาฟรีทุกวัน เวลา 09.00-21.00 น.");
    expect(prd.title).not.toContain("รวมวันหยุด");
    for (const win of windowsAround(main, "(ข้อมูล สปสช.)", 60)) {
      if (!win.includes("1663") && !win.includes("serviceHoursLabel")) continue;
      expect(win, win).not.toMatch(/ปรึกษาฟรี[\s\S]{0,40}\(ข้อมูล สปสช\.\)/);
    }
  });

  it("(k) in-person-only services cannot yield a handoff draft containing ออนไลน์", () => {
    const inPersonOnly = SERVICES.filter((s) => s.channels.length > 0 && s.channels.every((c) => c.type === "in_person"));
    expect(inPersonOnly.map((s) => s.id)).toContain("oscc_hospital");
    for (const s of inPersonOnly) {
      expect(canPrepareMessage(s), s.id).toBe(false);
    }
    for (const s of SERVICES) {
      if (!canPrepareMessage(s)) continue;
      const draft = draftSummary({
        service: s,
        needText: "ข้อความทดสอบ อยากคุยกับเจ้าหน้าที่",
        intent: "violence",
        ageBand: "unspecified",
      });
      if (s.channels.every((c) => c.type === "in_person")) {
        expect(draft, s.id).not.toContain("ออนไลน์");
      }
    }
    expect(read("src/main.ts")).toMatch(/canPrepareMessage\(s\.service\) && h\("button"/);
  });

  it("(i) 1300 is พม. 24 h every day and never ศูนย์พึ่งได้", () => {
    const s1300 = (data.services as any[]).find((s) => s.id === "hotline_1300")!;
    const c1300 = (data.crisis_lines as any[]).find((s) => s.id === "crisis_1300")!;
    expect(s1300.description_th).toContain("24 ชั่วโมง ทุกวัน");
    expect(JSON.stringify(s1300)).not.toContain("ศูนย์พึ่งได้");
    expect(JSON.stringify(c1300)).not.toContain("ศูนย์พึ่งได้");
  });
});
