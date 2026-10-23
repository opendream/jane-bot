import { describe, it, expect } from "vitest";
import { detectCrisis, crisisOrder, showCrisisOfficerLine } from "../../src/core/crisis";
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

  it("each crisis screen lists only the helplines that fit it, in ruling order", () => {
    expect(crisisOrder(["self_harm"])).toEqual(["1323", "1669"]);
    expect(crisisOrder(["sexual_violence"])).toEqual(["191", "1300"]);
    expect(crisisOrder(["violence_danger"])).toEqual(["1300", "191"]);
    expect(crisisOrder(["medical_emergency"])).toEqual(["1669"]);
  });

  it("mixed or unclear (empty, or more than one category) shows all four", () => {
    const all = ["1323", "1300", "1669", "191"];
    expect(crisisOrder([])).toEqual(all);
    expect(crisisOrder(["self_harm", "sexual_violence"])).toEqual(all);
    expect(crisisOrder(["violence_danger", "medical_emergency"])).toEqual(all);
    expect(crisisOrder(["self_harm", "sexual_violence", "violence_danger", "medical_emergency"])).toEqual(all);
  });

  it("officer line is only on the sexual-violence screen", () => {
    expect(showCrisisOfficerLine(["sexual_violence"])).toBe(true);
    expect(showCrisisOfficerLine(["self_harm"])).toBe(false);
    expect(showCrisisOfficerLine(["violence_danger"])).toBe(false);
    expect(showCrisisOfficerLine(["medical_emergency"])).toBe(false);
    expect(showCrisisOfficerLine([])).toBe(false);
    expect(showCrisisOfficerLine(["self_harm", "sexual_violence"])).toBe(false);
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
