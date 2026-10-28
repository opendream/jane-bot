import { describe, it, expect } from "vitest";
import { classifyNeed } from "../../src/core/intent";
import { suggestServices } from "../../src/core/referral";
import { detectCrisis } from "../../src/core/crisis";
import { crisisOrder } from "../../src/core/crisis-order";
import { draftSummary } from "../../src/core/summary";

const at = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00+07:00`);
const ids = (t: string, hhmm: string) => suggestServices(classifyNeed(t).intents, at(hhmm)).map((s) => s.service.id);

describe("scenario 4: consent (non-crisis)", () => {
  const t = "แฟนกดดันให้มีเซ็กส์ แต่หนูยังไม่พร้อม จะปฏิเสธยังไงดี";
  it("is not a crisis and maps to relationship/consent", () => {
    expect(detectCrisis(t).level).toBe("none");
    expect(classifyNeed(t).intents[0]).toBe("relationship_consent");
  });
  it("20:00 → Teen Club (youth service, open) first, then 1323 / 1300", () => {
    expect(ids(t, "20:00")).toEqual(["teen_club", "hotline_1323", "hotline_1300"]);
  });
  it("10:00 → 24 h lines move ahead of closed Teen Club", () => {
    expect(ids(t, "10:00")[0]).toBe("hotline_1323");
    expect(ids(t, "10:00")).toContain("teen_club");
  });
  it("summary asks for someone who understands refusing", () => {
    const [first] = suggestServices(classifyNeed(t).intents, at("20:00"));
    expect(draftSummary({ service: first.service, needText: t, intent: "relationship_consent", ageBand: "15-17" })).toContain("การปฏิเสธ");
  });
  it("being forced is a crisis override with 191 then 1300 (not the consent flow)", () => {
    for (const f of ["แฟนบังคับให้มีเพศสัมพันธ์ทั้งที่หนูไม่ยอม", "หนูโดนบังคับมีเซ็กส์", "เมื่อวานถูกบังคับให้มีเซ็กส์ ตอนนี้กลัวมาก", "โดนรุ่นพี่บังคับให้นอนด้วย", "แฟนบังคับให้มีอะไรด้วย"]) {
      const r = detectCrisis(f);
      expect(r.crisis, f).toBe(true);
      expect(crisisOrder(r.categories)).toEqual(["191", "1300"]);
    }
  });
});

it("pressure without force stays in the consent flow (no false override)", () => {
  for (const f of ["แฟนกดดันให้มีเซ็กส์ แต่หนูยังไม่พร้อม", "แฟนขอมีอะไรด้วย หนูยังไม่อยาก"]) expect(detectCrisis(f).level, f).toBe("none");
});

describe("scenario 5: mental health (non-crisis) vs crisis override", () => {
  const t = "ช่วงนี้เครียดมาก นอนไม่หลับ ร้องไห้ทุกคืน ไม่กล้าบอกที่บ้าน";
  it("is not a crisis; maps to mental health", () => {
    expect(detectCrisis(t).level).toBe("none");
    expect(classifyNeed(t).intents[0]).toBe("mental_health");
  });
  it("any time → 1323 (24 h) first; Teen Club offered when open", () => {
    expect(ids(t, "20:00")).toEqual(["hotline_1323", "teen_club"]);
    expect(ids(t, "23:30")[0]).toBe("hotline_1323");
  });
  it("same distress plus suicidal thought → crisis override, 1323 first", () => {
    const r = detectCrisis(t + " บางทีก็ไม่อยากมีชีวิตอยู่แล้ว");
    expect(r.crisis).toBe(true);
    expect(crisisOrder(r.categories)).toEqual(["1323", "1669"]);
  });
  it("mental health mixed with pregnancy worry keeps pregnancy first but offers mental-health help", () => {
    const r = classifyNeed("เครียดมาก กลัวท้อง ประจำเดือนไม่มา");
    expect(r.intents[0]).toBe("pregnancy");
    expect(r.intents).toContain("mental_health");
  });
});
