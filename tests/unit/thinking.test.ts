import { describe, it, expect } from "vitest";
import {
  THINKING_HINTS,
  MODEL_ANSWER_LABEL,
  RULES_ANSWER_LABEL,
  READINESS_LINE,
  thinkingHintAt,
  nextThinkingHintDelay,
  applyThinkingHint,
  engineAnswerLabel,
} from "../../src/ui/thinking";

describe("model-first thinking copy (Keng, exact Thai)", () => {
  it("keeps the four staged hints and the three labels byte-for-byte", () => {
    expect(THINKING_HINTS).toEqual([
      { atMs: 0, text: "เจนกำลังคิดนะ" },
      { atMs: 6_000, text: "เจนกำลังเลือกคำตอบที่ตรงกับเรื่องนี้อยู่นะ" },
      { atMs: 12_000, text: "ขอเวลาอีกนิดนะ เจนอยากตอบให้ตรงที่สุด" },
      { atMs: 17_000, text: "ใกล้เสร็จแล้วนะ" },
    ]);
    expect(MODEL_ANSWER_LABEL).toBe("คำตอบที่ AI ในเครื่องเลือกจากคลังคำตอบ");
    expect(RULES_ANSWER_LABEL).toBe("คำตอบจากคลังคำตอบ");
    expect(READINESS_LINE).toBe("กำลังเตรียมเจน…");
  });

  it("thinkingHintAt steps at 0 / 6 / 12 / 17 s", () => {
    expect(thinkingHintAt(0)).toBe("เจนกำลังคิดนะ");
    expect(thinkingHintAt(5_999)).toBe("เจนกำลังคิดนะ");
    expect(thinkingHintAt(6_000)).toBe("เจนกำลังเลือกคำตอบที่ตรงกับเรื่องนี้อยู่นะ");
    expect(thinkingHintAt(12_000)).toBe("ขอเวลาอีกนิดนะ เจนอยากตอบให้ตรงที่สุด");
    expect(thinkingHintAt(17_000)).toBe("ใกล้เสร็จแล้วนะ");
    expect(thinkingHintAt(19_999)).toBe("ใกล้เสร็จแล้วนะ");
  });

  it("nextThinkingHintDelay fires only at the 6 / 12 / 17 s steps", () => {
    expect(nextThinkingHintDelay(0)).toBe(6_000);
    expect(nextThinkingHintDelay(5_999)).toBe(1);
    expect(nextThinkingHintDelay(6_000)).toBe(6_000);
    expect(nextThinkingHintDelay(11_999)).toBe(1);
    expect(nextThinkingHintDelay(12_000)).toBe(5_000);
    expect(nextThinkingHintDelay(16_999)).toBe(1);
    expect(nextThinkingHintDelay(17_000)).toBeNull();
    expect(nextThinkingHintDelay(20_000)).toBeNull();
  });

  it("applyThinkingHint writes the next copy onto the existing node", () => {
    const node = { textContent: thinkingHintAt(0) };
    const root = { querySelector: (sel: string) => (sel === '[data-testid="chat-busy"]' ? node : null) };
    expect(applyThinkingHint(root, thinkingHintAt(6_000))).toBe(true);
    expect(node.textContent).toBe("เจนกำลังเลือกคำตอบที่ตรงกับเรื่องนี้อยู่นะ");
    expect(applyThinkingHint({ querySelector: () => null }, thinkingHintAt(12_000))).toBe(false);
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
    expect(engineAnswerLabel("chat-crisis", true)).toBe(RULES_ANSWER_LABEL);
    expect(engineAnswerLabel(undefined, true)).toBe(RULES_ANSWER_LABEL);
    expect(RULES_ANSWER_LABEL).not.toMatch(/AI/);
  });
});
