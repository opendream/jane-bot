import { describe, it, expect } from "vitest";
import { detectCrisis, crisisOrder } from "../../src/core/crisis";
import { CRISIS_LINES } from "../../src/core/referral";

describe("crisis detection (runs before everything, no model)", () => {
  const crisis: [string, string][] = [
    ["ไม่อยากมีชีวิตอยู่แล้ว", "self_harm"],
    ["คิดจะฆ่าตัวตาย", "self_harm"],
    ["อยาก ตาย", "self_harm"], // spaced
    ["หนูถูกข่มขืน", "sexual_violence"],
    ["โดนบังคับมีเซ็กส์", "sexual_violence"],
    ["พ่อเลี้ยงทุบตีทุกวัน", "violence_danger"],
    ["แฟนขู่จะฆ่า", "violence_danger"],
    ["เลือดออกเยอะมาก หลังกินยา", "medical_emergency"],
    ["I want to kill myself", "self_harm"],
  ];
  it.each(crisis)("%s → crisis (%s)", (text, cat) => {
    const r = detectCrisis(text);
    expect(r.crisis).toBe(true);
    expect(r.categories).toContain(cat);
  });

  const safe = ["ประจำเดือนมาช้า กลัวท้อง", "อยากกินยาคุม", "ชักชวนเพื่อนไปตรวจเลือด", "แฟนกดดันให้มีเซ็กส์"];
  it.each(safe)("%s → not crisis", (text) => {
    expect(detectCrisis(text).crisis).toBe(false);
  });

  it("crisis order puts the right line first and always shows all four", () => {
    expect(crisisOrder(["self_harm"])[0]).toBe("1323");
    expect(crisisOrder(["sexual_violence"])[0]).toBe("1300");
    expect(crisisOrder(["violence_danger"])[0]).toBe("191");
    expect(crisisOrder(["medical_emergency"])[0]).toBe("1669");
    for (const c of ["self_harm", "sexual_violence", "violence_danger", "medical_emergency"] as const)
      expect(new Set(crisisOrder([c]))).toEqual(new Set(["1323", "1300", "1669", "191"]));
  });

  it("every crisis line in the data has tel: link and a source with a check date", () => {
    expect(CRISIS_LINES.map((c) => c.number).sort()).toEqual(["1300", "1323", "1669", "191"]);
    for (const c of CRISIS_LINES) {
      expect(c.href).toBe(`tel:${c.number}`);
      expect(c.sources.length).toBeGreaterThan(0);
      expect(c.sources[0].checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
