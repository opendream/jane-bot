import { describe, it, expect } from "vitest";
import { openStatus, isOpenAt, minutesInZone } from "../../src/core/openNow";
import { SERVICES } from "../../src/core/referral";

const svc = (id: string) => SERVICES.find((s) => s.id === id)!;
const bkk = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00+07:00`);

describe("open now (Asia/Bangkok)", () => {
  it("uses Bangkok time regardless of host zone", () => {
    // 02:30 UTC == 09:30 BKK
    expect(minutesInZone(new Date("2026-10-22T02:30:00Z"))).toBe(9 * 60 + 30);
    // 23:30 UTC on 21 Oct == 06:30 BKK on 22 Oct
    expect(minutesInZone(new Date("2026-10-21T23:30:00Z"))).toBe(6 * 60 + 30);
  });

  const table: [string, string, "open" | "closed"][] = [
    // 1663: RSATHAI 09–21 vs GCC 10–20 → narrower 10–20
    ["hotline_1663", "09:30", "closed"], ["hotline_1663", "09:59", "closed"], ["hotline_1663", "10:00", "open"], ["hotline_1663", "19:59", "open"], ["hotline_1663", "20:00", "closed"], ["hotline_1663", "20:30", "closed"],
    ["tamtang", "09:59", "closed"], ["tamtang", "10:00", "open"], ["tamtang", "21:59", "open"], ["tamtang", "22:00", "closed"],
    ["teen_club", "16:59", "closed"], ["teen_club", "17:00", "open"], ["teen_club", "22:59", "open"], ["teen_club", "23:00", "closed"],
    ["teen_club", "00:30", "closed"], ["hotline_1323", "03:00", "open"], ["rsa_online", "04:00", "open"],
  ];
  it.each(table)("%s at %s BKK is %s", (id, t, expected) => {
    expect(openStatus(svc(id).hours, bkk(t)).state).toBe(expected);
  });

  it("labels say when it opens", () => {
    expect(openStatus(svc("teen_club").hours, bkk("12:00")).label_th).toContain("17:00");
    expect(openStatus(svc("hotline_1663").hours, bkk("12:00")).label_th).toContain("20:00");
  });

  it("varies → unknown", () => {
    expect(openStatus(svc("yfhs").hours, bkk("12:00")).state).toBe("unknown");
  });

  it("supports windows that cross midnight", () => {
    const h = { type: "daily" as const, open: "20:00", close: "02:00" };
    expect(isOpenAt(h, 21 * 60)).toBe(true);
    expect(isOpenAt(h, 60)).toBe(true);
    expect(isOpenAt(h, 3 * 60)).toBe(false);
  });
});
