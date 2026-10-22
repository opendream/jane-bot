import { describe, it, expect } from "vitest";
import { narrowestHours, hoursCitation, openStatus } from "../../src/core/openNow";
import { SERVICES } from "../../src/core/referral";
import type { Hours } from "../../src/core/types";

const d = (open: string, close: string): Hours => ({ type: "daily", open, close });
const svc = (id: string) => SERVICES.find((s) => s.id === id)!;
const bkk = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00+07:00`);

describe("narrowest window when sources disagree", () => {
  it("intersects same-day windows (latest open, earliest close)", () => {
    expect(narrowestHours([d("09:00", "21:00"), d("10:00", "20:00")])).toEqual(d("10:00", "20:00"));
    expect(narrowestHours([d("09:00", "20:00"), d("10:00", "21:00")])).toEqual(d("10:00", "20:00"));
    expect(narrowestHours([d("08:00", "22:00"), d("09:30", "21:00"), d("10:00", "21:30")])).toEqual(d("10:00", "21:00"));
  });
  it("order of sources does not matter", () => {
    expect(narrowestHours([d("10:00", "20:00"), d("09:00", "21:00")])).toEqual(narrowestHours([d("09:00", "21:00"), d("10:00", "20:00")]));
  });
  it("24h only wins when every source says 24h", () => {
    expect(narrowestHours([{ type: "24h" }, { type: "24h" }])).toEqual({ type: "24h" });
    expect(narrowestHours([{ type: "24h" }, d("08:00", "16:00")])).toEqual(d("08:00", "16:00"));
  });
  it("'varies' adds no window; all-varies stays varies", () => {
    expect(narrowestHours([{ type: "varies" }])).toEqual({ type: "varies" });
    expect(narrowestHours([{ type: "varies" }, d("08:00", "16:00")])).toEqual(d("08:00", "16:00"));
  });
  it("disjoint or midnight-crossing windows fall back to the shortest single window (never wider)", () => {
    expect(narrowestHours([d("08:00", "10:00"), d("12:00", "18:00")])).toEqual(d("08:00", "10:00"));
    expect(narrowestHours([d("20:00", "02:00"), d("18:00", "23:00")])).toEqual(d("18:00", "23:00"));
  });
  it("1663 open-now uses 10:00–20:00 (GCC) not 09:00–21:00 (RSATHAI)", () => {
    expect(svc("hotline_1663").hours).toEqual(d("10:00", "20:00"));
    expect(openStatus(svc("hotline_1663").hours, bkk("09:30")).state).toBe("closed");
    expect(openStatus(svc("hotline_1663").hours, bkk("20:30")).state).toBe("closed");
    expect(openStatus(svc("hotline_1663").hours, bkk("15:00")).state).toBe("open");
  });
});

describe("hours citations on the card", () => {
  it("1663 cites both sources and flags the conflict", () => {
    const c = hoursCitation(svc("hotline_1663"));
    expect(c.conflict).toBe(true);
    expect(c.effective_th).toBe("ทุกวัน 10:00–20:00 น.");
    expect(c.conflict_note_th).toContain("ช่วงเวลาที่แคบกว่า");
    expect(c.lines).toHaveLength(2);
    expect(c.lines[0]).toBe("RSATHAI: ทุกวัน 09:00–21:00 น. · rsathai.org/qrcode · ตรวจ 2026-10-22");
    expect(c.lines[1]).toMatch(/^GCC Call Center ภาครัฐ: ทุกวัน 10:00–20:00 น\. \(source 2025\) · gcontact\.gcc\.go\.th\/index\.php · ตรวจ 2026-10-22$/);
  });
  it("Teen Club 17–23 is labelled 'source 2022'", () => {
    const c = hoursCitation(svc("teen_club"));
    expect(c.conflict).toBe(false);
    expect(c.conflict_note_th).toBeNull();
    expect(c.lines).toEqual(["RSATHAI: ทุกวัน 17:00–23:00 น. (source 2022) · rsathai.org/contents/23639 · ตรวจ 2026-10-22"]);
  });
  it("agreeing sources are not a conflict (1300: both 24h)", () => {
    const c = hoursCitation(svc("hotline_1300"));
    expect(c.conflict).toBe(false);
    expect(c.lines).toHaveLength(2);
  });
  it("every service has at least one hours source with url and check date", () => {
    for (const s of SERVICES) {
      expect(s.hours_sources.length, s.id).toBeGreaterThan(0);
      for (const x of s.hours_sources) { expect(x.url).toMatch(/^https:\/\//); expect(x.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(x.by.length).toBeGreaterThan(1); }
    }
  });
});
