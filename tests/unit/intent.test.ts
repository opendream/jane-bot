import { describe, it, expect } from "vitest";
import { classifyNeed } from "../../src/core/intent";
import { suggestServices } from "../../src/core/referral";

const at = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00+07:00`);

describe("classifyNeed (rules)", () => {
  const cases: [string, string][] = [
    ["ประจำเดือนมาช้าไปสองอาทิตย์ กลัวท้อง ไม่กล้าบอกใคร", "pregnancy"],
    ["เมื่อคืนถุงยางแตก ต้องกินยาคุมฉุกเฉินไหม", "emergency_contraception"],
    ["มีเพศสัมพันธ์โดยไม่ได้ป้องกันเมื่อวาน", "emergency_contraception"],
    ["อยากเริ่มกินยาคุม แต่ไม่รู้จะเลือกแบบไหน", "contraception"],
    ["อยากไปตรวจเอชไอวีแบบไม่ให้พ่อแม่รู้", "sti_hiv"],
    ["ตกขาวเยอะผิดปกติ กลัวเป็นโรคติดต่อทางเพศ", "sti_hiv"],
    ["แฟนกดดันให้มีเซ็กส์ แต่หนูยังไม่พร้อม", "relationship_consent"],
    ["ช่วงนี้เครียดมาก นอนไม่หลับ ร้องไห้ทุกคืน", "mental_health"],
    ["แฟนเก่าขู่ปล่อยคลิป", "violence"],
    ["อยากรู้เรื่องสิว", "other"],
    ["I think I need PrEP", "sti_hiv"],
  ];
  it.each(cases)("%s → %s", (text, expected) => {
    expect(classifyNeed(text).intents[0]).toBe(expected);
  });

  it("does not read stomach ache (ปวดท้อง) as pregnancy", () => {
    expect(classifyNeed("ปวดท้องมาสองวัน").intents).not.toContain("pregnancy");
    expect(classifyNeed("ปวด ท้อง เมนส์").intents).not.toContain("pregnancy"); // period cramps
    expect(classifyNeed("ปวดท้อง แต่เมนส์ไม่มา").intents[0]).toBe("pregnancy");
  });

  it("short Latin keywords need word boundaries (question ≠ STI)", () => {
    expect(classifyNeed("I have a question").intents).toEqual(["other"]);
  });

  it("weak EC words alone do not trigger emergency contraception", () => {
    expect(classifyNeed("เมื่อคืนนอนไม่หลับ").intents[0]).toBe("mental_health");
  });

  it("returns several ranked intents when the need is mixed", () => {
    const r = classifyNeed("ประจำเดือนไม่มา กลัวท้อง เครียดมาก");
    expect(r.intents[0]).toBe("pregnancy");
    expect(r.intents).toContain("mental_health");
    expect(r.source).toBe("rules");
  });
});

describe("suggestServices", () => {
  it("returns 1–3 services, all matched to a real data entry with sources", () => {
    const s = suggestServices(["pregnancy"], at("19:00"));
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s.length).toBeLessThanOrEqual(3);
    for (const x of s) expect(x.service.sources.length).toBeGreaterThan(0);
  });
  it("pregnancy at 19:00 BKK: 1663 first (open), Teen Club also open", () => {
    const ids = suggestServices(["pregnancy"], at("19:00")).map((x) => x.service.id);
    expect(ids[0]).toBe("hotline_1663");
    expect(ids).toContain("teen_club");
  });
  it("pregnancy at 08:00 BKK: open-now 24h service moves first", () => {
    const s = suggestServices(["pregnancy"], at("08:00"));
    expect(s[0].service.id).toBe("rsa_online");
    expect(s[0].status.state).toBe("open");
  });
  it("emergency contraception at 08:30 keeps 1663 first even though closed (shows opening time)", () => {
    const s = suggestServices(["emergency_contraception", "pregnancy"], at("08:30"));
    expect(s[0].service.id).toBe("hotline_1663");
    expect(s[0].status.state).toBe("closed");
    expect(s[0].status.label_th).toContain("09:00");
  });
  it("mental health → 1323 (24h) first", () => {
    expect(suggestServices(["mental_health"], at("03:00"))[0].service.id).toBe("hotline_1323");
  });
  it("unknown need still returns services", () => {
    expect(suggestServices([], at("12:00")).length).toBeGreaterThan(0);
  });
});
