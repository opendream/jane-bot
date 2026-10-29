import { describe, it, expect } from "vitest";
import {
  THINKING_HINTS,
  MODEL_ANSWER_LABEL,
  RULES_ANSWER_LABEL,
  READINESS_LINE,
  thinkingHintAt,
  engineAnswerLabel,
} from "../../src/ui/thinking";

describe("model-first thinking copy (Keng, exact Thai)", () => {
  it("keeps the four staged hints and the three labels byte-for-byte", () => {
    expect(THINKING_HINTS).toEqual([
      { atMs: 0, text: "พี่เจนกำลังคิดนะ" },
      { atMs: 6_000, text: "พี่เจนกำลังเลือกคำตอบที่ตรงกับเรื่องนี้อยู่นะ" },
      { atMs: 12_000, text: "ขอเวลาอีกนิดนะ พี่เจนอยากตอบให้ตรงที่สุด" },
      { atMs: 17_000, text: "ใกล้เสร็จแล้วนะ" },
    ]);
    expect(MODEL_ANSWER_LABEL).toBe("คำตอบที่ AI ในเครื่องเลือกจากคลังคำตอบ");
    expect(RULES_ANSWER_LABEL).toBe("คำตอบจากคลังคำตอบ");
    expect(READINESS_LINE).toBe("กำลังเตรียมพี่เจน…");
  });

  it("thinkingHintAt steps at 0 / 6 / 12 / 17 s", () => {
    expect(thinkingHintAt(0)).toBe("พี่เจนกำลังคิดนะ");
    expect(thinkingHintAt(5_999)).toBe("พี่เจนกำลังคิดนะ");
    expect(thinkingHintAt(6_000)).toBe("พี่เจนกำลังเลือกคำตอบที่ตรงกับเรื่องนี้อยู่นะ");
    expect(thinkingHintAt(12_000)).toBe("ขอเวลาอีกนิดนะ พี่เจนอยากตอบให้ตรงที่สุด");
    expect(thinkingHintAt(17_000)).toBe("ใกล้เสร็จแล้วนะ");
    expect(thinkingHintAt(19_999)).toBe("ใกล้เสร็จแล้วนะ");
  });

  it("flag-off never labels an engine; flag-on uses the model label only for engine=model", () => {
    expect(engineAnswerLabel("model", false)).toBeNull();
    expect(engineAnswerLabel("rules-fallback", false)).toBeNull();
    expect(engineAnswerLabel(undefined, false)).toBeNull();
    expect(engineAnswerLabel("model", true)).toBe(MODEL_ANSWER_LABEL);
    expect(engineAnswerLabel("rules-fallback", true)).toBe(RULES_ANSWER_LABEL);
    expect(engineAnswerLabel("rules-locked", true)).toBe(RULES_ANSWER_LABEL);
    expect(engineAnswerLabel("rules-not-ready", true)).toBe(RULES_ANSWER_LABEL);
    expect(engineAnswerLabel("rules-crisis", true)).toBe(RULES_ANSWER_LABEL);
    expect(engineAnswerLabel(undefined, true)).toBe(RULES_ANSWER_LABEL);
    expect(RULES_ANSWER_LABEL).not.toMatch(/AI/);
  });
});
