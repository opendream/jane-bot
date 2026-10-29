import { describe, expect, it } from "vitest";
import { CHAT_COVERAGE_ALLOW, CHAT_COVERAGE_ALLOW_SET } from "../../src/llm/chat-factcheck-allow";

/** Unigrams this allowlist must never contain. Phrases like วันนี้ are a different entry. */
const FORBIDDEN = [
  "พ่อ", "แม่", "ผู้ปกครอง", "ผู้ใหญ่", "บิดา", "มารดา", "เซ็น", "ปกครอง",
  "อุ่น", "ต้ม", "ลวก", "เผา", "ล้าง", "ซัก", "สอด", "ทา", "กิน", "ดื่ม", "สวน", "ใส่",
  "เม็ด", "โดส", "ปี", "ขวบ", "วัน", "ชั่วโมง", "บาท", "ขวด", "ชั้น",
  "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า", "สิบ", "ยี่สิบ", "เอ็ด",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty",
  "parent", "parents", "guardian", "hospital", "clinic", "pharmacy", "prescription",
  "ศิริราช", "เชียงใหม่", "โรงพยาบาล",
];

describe("chat coverage allowlist", () => {
  it("is a short explicit reviewed list", () => {
    expect(CHAT_COVERAGE_ALLOW.length).toBeLessThan(250);
    expect(CHAT_COVERAGE_ALLOW_SET.has("เข้าใจ")).toBe(true);
    expect(CHAT_COVERAGE_ALLOW_SET.has("ไม่ต้องกังวล")).toBe(true);
    expect(CHAT_COVERAGE_ALLOW_SET.has("ปรึกษา")).toBe(true);
    expect(CHAT_COVERAGE_ALLOW_SET.has("ซักถาม")).toBe(true);
  });

  it("contains no action verbs, units, numbers, ages, authority nouns, or place names", () => {
    for (const w of CHAT_COVERAGE_ALLOW) {
      expect(FORBIDDEN, w).not.toContain(w.normalize("NFC").toLowerCase());
    }
  });
});
