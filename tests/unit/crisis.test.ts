import { describe, it, expect } from "vitest";
import { detectCrisis, crisisOrder as pinnedCrisisOrder } from "../../src/core/crisis";
import { crisisOrder } from "../../src/core/crisis-order";
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

  it("banner phrases keep all four in the pinned strip order; the short list is not the strip", () => {
    const cases: [string, string[]][] = [
      ["ซีรีส์เรื่องนี้มีฉากข่มขืน ดูแล้วไม่สบายใจ", ["1300", "191", "1669", "1323"]],
      ["ข่าววันนี้ เรื่องฆ่าตัวตาย", ["1323", "1669", "1300", "191"]],
      ["เลือดออกมากนิดหน่อย", ["1669", "191", "1323", "1300"]],
    ];
    for (const [text, pinned] of cases) {
      const r = detectCrisis(text);
      expect(r.crisis, text).toBe(false);
      expect(r.level, text).toBe("banner");
      expect(pinnedCrisisOrder(r.categories), text).toEqual(pinned);
      expect(pinnedCrisisOrder(r.categories), text).toHaveLength(4);
      expect(crisisOrder(r.categories), text).not.toEqual(pinned);
    }
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
