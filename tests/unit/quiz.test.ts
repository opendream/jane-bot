import { describe, it, expect } from "vitest";
import {
  QUIZ_ITEMS, QUIZ_FILE_LICENCE, QUIZ_HOURS_1663, QUIZ_SESSION_LEN, QUIZ_WRAP,
  QUIZ_OK, QUIZ_NO, QUIZ_PRAISE, quizCopyStatus,
  validateQuizItems, shippableQuiz, pickQuizItems, quizAgeAllowed, hasRelatedQuiz,
  isChoiceCorrect, isOrderCorrect, moveIndex, shuffledIndexes,
  startQuiz, answerChoice, answerOrder, advanceQuiz, choiceWasCorrect, currentItem,
  type QuizItem,
} from "../../src/core/quiz";
import { BANK_TEXT_LICENCE } from "../../src/core/bank";
import { BANK } from "../../src/core/bankData";
import { THAI_COPY_STATUS } from "../../src/config";

const byId = (id: string) => QUIZ_ITEMS.find((q) => q.id === id)!;
const clone = (id: string, over: Partial<QuizItem> = {}): QuizItem => ({ ...byId(id), ...over });

describe("D7 quiz items (approved, All 15+)", () => {
  it("seven items validate; licence and Judies source required; every row is All (15+) including QZ-07", () => {
    expect(validateQuizItems(QUIZ_ITEMS)).toEqual([]);
    expect(QUIZ_FILE_LICENCE).toBe(BANK_TEXT_LICENCE);
    expect(QUIZ_ITEMS).toHaveLength(7);
    expect(QUIZ_ITEMS.every((q) => q.status === "approved" && q.licence === BANK_TEXT_LICENCE && q.source && q.age_min === 15)).toBe(true);
    expect(byId("QZ-02").age_min).toBe(15);
    expect(byId("QZ-03").age_min).toBe(15);
    expect(byId("QZ-07").status).toBe("approved");
    expect(byId("QZ-04").explanation_th).toContain(QUIZ_HOURS_1663);
    expect(QUIZ_WRAP).not.toMatch(/\d+\s*\/\s*\d+|คะแนน|ถูก \d/);
  });
  it("is not part of the card bank", () => {
    expect(BANK.some((c) => String(c.id).startsWith("QZ-") || String(c.id).startsWith("quiz."))).toBe(false);
  });
  it("approved items ship in reviewed mode", () => {
    expect(shippableQuiz(QUIZ_ITEMS, "reviewed")).toHaveLength(7);
    expect(shippableQuiz(QUIZ_ITEMS, "draft").length).toBe(7);
    expect(pickQuizItems("18+", null, QUIZ_ITEMS, 3, "reviewed").map((q) => q.id)).toEqual(["QZ-01", "QZ-02", "QZ-03"]);
    expect(pickQuizItems("18+", "contraception", QUIZ_ITEMS, 3, "reviewed").map((q) => q.id)).toEqual(["QZ-01", "QZ-03", "QZ-07"]);
    expect(startQuiz("18+", null, QUIZ_ITEMS, undefined, "reviewed")).not.toBeNull();
    expect(startQuiz("18+", "contraception", QUIZ_ITEMS, undefined, "reviewed")).not.toBeNull();
    expect(hasRelatedQuiz("contraception", "18+", QUIZ_ITEMS, "reviewed")).toBe(true);
    expect(hasRelatedQuiz("contraception", "18+", QUIZ_ITEMS, "draft")).toBe(true);
    expect(quizCopyStatus()).toBe(THAI_COPY_STATUS);
    expect(pickQuizItems("18+", null).map((q) => q.id)).toEqual(
      pickQuizItems("18+", null, QUIZ_ITEMS, QUIZ_SESSION_LEN, THAI_COPY_STATUS).map((q) => q.id),
    );
    const placeholder = [clone("QZ-01", { status: "PLACEHOLDER" })];
    expect(pickQuizItems("15-17", "contraception", placeholder, 3, "reviewed")).toEqual([]);
    expect(startQuiz("15-17", "contraception", placeholder, undefined, "reviewed")).toBeNull();
  });
  it("production ignores ?copy= and always uses THAI_COPY_STATUS", () => {
    expect(quizCopyStatus(false, "?copy=reviewed")).toBe(THAI_COPY_STATUS);
    expect(quizCopyStatus(false, "?copy=draft")).toBe(THAI_COPY_STATUS);
    expect(quizCopyStatus(true, "?copy=reviewed")).toBe("reviewed");
    expect(quizCopyStatus(true, "?copy=draft")).toBe("draft");
    expect(pickQuizItems("18+", null, QUIZ_ITEMS, 3, quizCopyStatus(false, "?copy=reviewed"))).toEqual(
      pickQuizItems("18+", null, QUIZ_ITEMS, 3, THAI_COPY_STATUS),
    );
    expect(hasRelatedQuiz("contraception", "18+", QUIZ_ITEMS, quizCopyStatus(false, "?copy=reviewed"))).toBe(
      hasRelatedQuiz("contraception", "18+", QUIZ_ITEMS, THAI_COPY_STATUS),
    );
    expect(hasRelatedQuiz("contraception", "18+", QUIZ_ITEMS, quizCopyStatus(true, "?copy=reviewed"))).toBe(true);
  });
});

describe("validator rules", () => {
  it("licence required", () => {
    expect(validateQuizItems([clone("QZ-01", { licence: "" })], BANK_TEXT_LICENCE).map((i) => i.rule)).toContain("licence");
    expect(validateQuizItems([clone("QZ-01", { licence: "Apache-2.0" })], BANK_TEXT_LICENCE).map((i) => i.rule)).toContain("licence");
  });
  it("Judies source required", () => {
    expect(validateQuizItems([clone("QZ-01", { source: "" })]).map((i) => i.rule)).toContain("source");
  });
  it("answer must match options", () => {
    expect(validateQuizItems([clone("QZ-01", { answer: 9 })]).map((i) => i.rule)).toContain("answer");
    expect(validateQuizItems([clone("QZ-03", { answer: [0, 1] })]).map((i) => i.rule)).toContain("answer");
  });
  it("no prices and no 100%", () => {
    expect(validateQuizItems([clone("QZ-01", { explanation_th: "ได้ผล 100%" })]).some((i) => i.msg.includes("100%"))).toBe(true);
    expect(validateQuizItems([clone("QZ-01", { explanation_th: "ราคา 50 บาท" })]).some((i) => i.msg.includes("prices"))).toBe(true);
  });
  it("1663 hours must be the exact D3 string", () => {
    const bad = clone("QZ-04", { explanation_th: "โทร 1663 ฟรี 24 ชั่วโมง 09:00-21:00" });
    expect(validateQuizItems([bad]).map((i) => i.rule)).toContain("hours_1663");
    expect(validateQuizItems([byId("QZ-04")])).toEqual([]);
  });
  it("QZ-04 ships the canonical 1663 hours and never 120 h, ulipristal, or a price", () => {
    const q = byId("QZ-04");
    const blob = [q.prompt_th, q.prompt_en, q.explanation_th, q.explanation_en, q.correct_answer_text, ...(q.options ?? [])].join("\n");
    expect(q.explanation_th).toContain(QUIZ_HOURS_1663);
    expect(QUIZ_HOURS_1663).toBe("ปรึกษาฟรี ทุกวัน 09:00–21:00 น.");
    expect(QUIZ_HOURS_1663).not.toContain("รวมวันหยุด");
    expect(q.explanation_th).not.toContain("รวมวันหยุด");
    expect(q.explanation_en).not.toMatch(/holiday/i);
    expect(q.options[2]).toBe("ค) หลังมีเพศสัมพันธ์ที่ไม่ได้ป้องกัน กินให้เร็วที่สุด ภายใน 72 ชม.");
    expect(blob).not.toMatch(/120\s*h|120\s*ชม|ulipristal|บาท|฿/i);
  });
  it("1663 hours in a quiz item must match the cited 09:00–21:00 window", () => {
    const wrong = clone("QZ-04", { explanation_th: "โทร 1663 ปรึกษาฟรี ทุกวัน 09:00–21:00 น. เวลา 08:00–22:00" });
    expect(validateQuizItems([wrong]).map((i) => i.rule)).toContain("hours_match_source");
    const holiday = clone("QZ-04", { explanation_th: "โทร 1663 ปรึกษาฟรี ทุกวัน 09:00–21:00 น. รวมวันหยุด" });
    expect(validateQuizItems([holiday]).map((i) => i.rule)).toContain("hours_1663");
  });
  it("QZ-02 and QZ-03 are All (15+); an invalid age_min still fails", () => {
    expect(byId("QZ-02").age_min).toBe(15);
    expect(byId("QZ-03").age_min).toBe(15);
    expect(validateQuizItems([clone("QZ-02", { age_min: 16 as 15 })]).map((i) => i.rule)).toContain("age_min");
    expect(validateQuizItems([clone("QZ-03", { age_min: 16 as 15 })]).map((i) => i.rule)).toContain("age_min");
  });
  it("ship gate: reviewed copy rejects PLACEHOLDER/unapproved quiz items and accepts the shipped set", () => {
    expect(validateQuizItems(QUIZ_ITEMS, QUIZ_FILE_LICENCE, "reviewed")).toEqual([]);
    expect(validateQuizItems([clone("QZ-01", { status: "PLACEHOLDER" })], QUIZ_FILE_LICENCE, "reviewed").map((i) => i.rule)).toContain("ship_gate");
    expect(validateQuizItems([clone("QZ-01", { status: "approved" })], QUIZ_FILE_LICENCE, "reviewed")).toEqual([]);
    expect(validateQuizItems(QUIZ_ITEMS)).toEqual([]);
  });
});

describe("age filter and session pick", () => {
  it("every age band including 15–17 / ไม่อยากบอก sees the All (15+) items", () => {
    for (const age of ["15-17", "unspecified", null, undefined] as const) {
      const ids = pickQuizItems(age, null).map((q) => q.id);
      expect(ids).toEqual(["QZ-01", "QZ-02", "QZ-03"]);
      expect(ids.length).toBeLessThanOrEqual(QUIZ_SESSION_LEN);
      expect(quizAgeAllowed(byId("QZ-02"), age)).toBe(true);
      expect(quizAgeAllowed(byId("QZ-01"), age)).toBe(true);
    }
    expect(pickQuizItems("18+", null).map((q) => q.id)).toEqual(["QZ-01", "QZ-02", "QZ-03"]);
  });
  it("prefers the current topic and fills to 3", () => {
    expect(pickQuizItems("15-17", "emergency_contraception").map((q) => q.id)).toEqual(["QZ-02", "QZ-04", "QZ-01"]);
    expect(pickQuizItems("18+", "contraception").map((q) => q.id)).toEqual(["QZ-01", "QZ-03", "QZ-07"]);
    expect(hasRelatedQuiz("emergency_contraception", "15-17")).toBe(true);
    expect(hasRelatedQuiz("mental_health", "15-17")).toBe(false);
  });
});

describe("true/false", () => {
  it("checks the answer and keeps the explanation", () => {
    const q = byId("QZ-01");
    expect(isChoiceCorrect(q, 1)).toBe(true);
    expect(isChoiceCorrect(q, 0)).toBe(false);
    const s = startQuiz("15-17", "contraception")!;
    expect(currentItem(s).format).toBe("true_false");
    const wrong = answerChoice(s, 0);
    expect(choiceWasCorrect(wrong)).toBe(false);
    expect(currentItem(wrong).explanation_th).toBe(q.explanation_th);
    const right = answerChoice(s, 1);
    expect(choiceWasCorrect(right)).toBe(true);
  });
});

describe("multiple choice", () => {
  it("QZ-04 index 2 is correct; QZ-05 chat-style uses the same checker", () => {
    expect(isChoiceCorrect(byId("QZ-04"), 2)).toBe(true);
    expect(isChoiceCorrect(byId("QZ-04"), 0)).toBe(false);
    expect(isChoiceCorrect(byId("QZ-05"), 1)).toBe(true);
    expect(byId("QZ-05").format).toBe("multiple_choice_chat");
  });
});

describe("ordering", () => {
  it("up/down move steps; identity is correct; shuffle is not drag-only", () => {
    const q = byId("QZ-03");
    expect(isOrderCorrect(q, [0, 1, 2, 3, 4])).toBe(true);
    expect(isOrderCorrect(q, [1, 0, 2, 3, 4])).toBe(false);
    expect(moveIndex([0, 1, 2], 1, -1)).toEqual([1, 0, 2]);
    expect(moveIndex([0, 1, 2], 1, 1)).toEqual([0, 2, 1]);
    expect(moveIndex([0, 1, 2], 0, -1)).toEqual([0, 1, 2]);
    const sh = shuffledIndexes(5, () => 0.99);
    expect(sh).toHaveLength(5);
    expect(new Set(sh).size).toBe(5);
  });
});

describe("session flow: explain, next, stop, wrap-up with no score", () => {
  it("three items then a score-free wrap; stop is just leaving the session", () => {
    let s = startQuiz("15-17", "emergency_contraception")!;
    expect(s.items).toHaveLength(3);
    s = answerChoice(s, 2);
    expect(s.phase).toBe("explain");
    s = advanceQuiz(s);
    expect(s.phase).toBe("ask");
    expect(s.index).toBe(1);
    s = answerChoice(s, 0);
    s = advanceQuiz(s);
    s = answerChoice(s, 0);
    s = advanceQuiz(s);
    expect(s.phase).toBe("done");
    expect(QUIZ_WRAP).toBe("ขอบคุณที่ลองทำควิซนะ กลับไปคุยกับพี่เจนต่อได้เลย");
    expect(startQuiz("15-17", null)).not.toBeNull();
  });
  it("ordering session records the current order on confirm", () => {
    const s = startQuiz("18+", "contraception", QUIZ_ITEMS, () => 0)!;
    const ord = s.items.find((q) => q.format === "ordering");
    expect(ord?.id).toBe("QZ-03");
    const at = { ...s, index: s.items.findIndex((q) => q.id === "QZ-03"), order: [0, 1, 2, 3, 4], phase: "ask" as const };
    const done = answerOrder(at);
    expect(choiceWasCorrect(done)).toBe(true);
    expect(done.phase).toBe("explain");
  });
});

describe("wrong-answer view is verdict + neutral explanation, never praise", () => {
  it("every item's wrong-answer view uses ยังไม่ถูก and contains no praise phrase", () => {
    expect(QUIZ_OK).toBe("ถูกต้อง");
    expect(QUIZ_NO).toBe("ยังไม่ถูก");
    for (const q of QUIZ_ITEMS) {
      const view = `${QUIZ_NO}\n${q.explanation_th}`;
      expect(view, q.id).not.toMatch(QUIZ_PRAISE);
      expect(view, q.id).toContain(QUIZ_NO);
      expect(view, q.id).not.toContain(QUIZ_OK);
      expect(q.explanation_th, q.id).not.toMatch(QUIZ_PRAISE);
    }
  });
  it("QZ-03 shuffled-order immediate confirm is wrong and not praise", () => {
    let s = startQuiz("18+", "contraception", QUIZ_ITEMS, () => 0.99)!;
    expect(s.items.some((q) => q.id === "QZ-03")).toBe(true);
    s = answerChoice(s, 0);
    s = advanceQuiz(s, () => 0.99);
    expect(currentItem(s).id).toBe("QZ-03");
    expect(s.order).not.toEqual([0, 1, 2, 3, 4]);
    const done = answerOrder(s);
    expect(choiceWasCorrect(done)).toBe(false);
    const view = `${QUIZ_NO}\n${currentItem(done).explanation_th}`;
    expect(view).not.toMatch(QUIZ_PRAISE);
    expect(view).toContain(QUIZ_NO);
  });
});
