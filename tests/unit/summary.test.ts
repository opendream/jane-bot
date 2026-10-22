import { describe, it, expect } from "vitest";
import { draftSummary, stripPII, finalizeSummary, clip, MAX_NEED_CHARS } from "../../src/core/summary";
import { SERVICES } from "../../src/core/referral";
import { acceptPolished, classifyWithFallback, polishWithFallback, type LLMAdapter } from "../../src/llm/adapter";

const s1663 = SERVICES.find((s) => s.id === "hotline_1663")!;

describe("stripPII", () => {
  const cases: [string, string][] = [
    ["โทรหาหนูได้ที่ 081-234-5678 นะ", "081"],
    ["เบอร์ 0812345678", "0812345678"],
    ["+66 81 234 5678", "234"],
    ["ไลน์ ploy_2009 ค่ะ", "ploy_2009"],
    ["ig: @ploy.cute", "ploy.cute"],
    ["อีเมล ploy@example.com", "ploy@example.com"],
    ["หนูชื่อพลอย อายุ 17", "พลอย"],
    ["เรียนอยู่โรงเรียนสตรีวิทยา", "สตรีวิทยา"],
    ["บ้านอยู่ซอยลาดพร้าว101", "ลาดพร้าว"],
    ["my name is Ploy", "Ploy"],
  ];
  it.each(cases)("removes PII from %s", (input, leaked) => {
    const out = stripPII(input);
    expect(out).not.toContain(leaked);
    expect(out).toContain("[ลบข้อมูลส่วนตัว]");
  });
  it("keeps ordinary text and short numbers", () => {
    expect(stripPII("ประจำเดือนมาช้า 2 อาทิตย์ อายุ 17 ปี")).toBe("ประจำเดือนมาช้า 2 อาทิตย์ อายุ 17 ปี");
    expect(stripPII("หนูไม่เชื่อว่าท้อง")).toBe("หนูไม่เชื่อว่าท้อง"); // เชื่อ ≠ ชื่อ
  });
});

describe("draftSummary", () => {
  const d = draftSummary({ service: s1663, needText: "หนูชื่อพลอย เบอร์ 0812345678 ประจำเดือนมาช้า กลัวท้อง", intent: "pregnancy", ageBand: "15-17" });
  it("follows the 6-line template", () => {
    const lines = d.split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("ถึงเจ้าหน้าที่");
    expect(lines[0]).toContain("1663");
    expect(lines[1].startsWith("- เรื่องที่อยากปรึกษา:")).toBe(true);
    expect(lines[2]).toContain("15–17 ปี");
    expect(lines[3]).toContain("ตรวจครรภ์");
    expect(lines[4]).toContain("โทรศัพท์");
    expect(lines[5]).toContain("ยืนยันเองแล้ว");
  });
  it("contains no name or phone", () => {
    expect(d).not.toContain("พลอย");
    expect(d).not.toContain("0812345678");
    expect(d).toContain("กลัวท้อง");
  });
  it("is short", () => {
    expect(clip("ก".repeat(500)).length).toBeLessThanOrEqual(MAX_NEED_CHARS + 1);
    expect(d.length).toBeLessThan(450);
  });
  it("finalizeSummary strips PII typed into the editor at approval time", () => {
    const edited = d + "\nติดต่อกลับ 089-999-1111";
    expect(finalizeSummary(edited)).not.toContain("089-999-1111");
  });
});

describe("LLM adapter fallback", () => {
  const broken: LLMAdapter = { name: "broken", ready: () => true,
    classify: async () => { throw new Error("x"); }, polishSummary: async () => "garbage" };
  const slow: LLMAdapter = { name: "slow", ready: () => true,
    classify: () => new Promise((r) => setTimeout(() => r(["other"]), 5000)), polishSummary: async () => null };
  const good: LLMAdapter = { name: "good", ready: () => true,
    classify: async () => ["contraception", "not_an_intent" as any], polishSummary: async (d) => d.replace("สิ่งที่อยากได้: อยาก", "สิ่งที่อยากได้: ต้องการ") };

  it("rules used when there is no model", async () => {
    expect((await classifyWithFallback("กลัวท้อง", null)).source).toBe("rules");
  });
  it("rules used when the model throws", async () => {
    const r = await classifyWithFallback("กลัวท้อง", broken);
    expect(r.source).toBe("rules"); expect(r.intents[0]).toBe("pregnancy");
  });
  it("rules used when the model is too slow", async () => {
    expect((await classifyWithFallback("กลัวท้อง", slow, 50)).source).toBe("rules");
  });
  it("model output is validated (unknown intents dropped)", async () => {
    const r = await classifyWithFallback("กลัวท้อง", good);
    expect(r.source).toBe("model"); expect(r.intents).toEqual(["contraception"]);
  });
  it("polished summary must keep the template, else the draft is used", async () => {
    const d = draftSummary({ service: s1663, needText: "กลัวท้อง", intent: "pregnancy", ageBand: "unspecified" });
    expect(await polishWithFallback(d, broken)).toBe(d);
    expect(await polishWithFallback(d, good)).toContain("ต้องการ");
    expect(acceptPolished(d, d + "\nโทร 0812345678")).toBe(d); // extra line
    expect(acceptPolished(d, d.replace("กลัวท้อง", "กลัวท้อง โทร 0812345678"))).toBe(d); // new number
    expect(acceptPolished(d, d.replace("เรื่องที่อยากปรึกษา", "หัวข้อ"))).toBe(d); // template changed
  });
});
