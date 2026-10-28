import { describe, it, expect } from "vitest";
import { QUIZ, validateQuiz, shippableQuiz, type Quiz } from "../../src/core/quiz";
import { BANK } from "../../src/core/bankData";

const ids = new Set(BANK.map((c) => c.id));
const q = (over: Record<string, unknown> = {}) => ({ id: "quiz.p009", placeholder: true, question_th: "PLACEHOLDER · ทดสอบ", options: [{ label_th: "ก", correct: true }, { label_th: "ข", correct: false }], explain_card_id: "contraception.p000", review: { status: "draft" }, ...over });

describe("quiz shell (D7 pending)", () => {
  it("the bundled quiz is valid and placeholder-only", () => {
    expect(validateQuiz(QUIZ, ids)).toEqual([]);
    expect(QUIZ.questions.length).toBeGreaterThan(0);
    expect(QUIZ.questions.every((x) => x.placeholder && x.question_th.includes("PLACEHOLDER"))).toBe(true);
  });
  it("is not part of the card bank", () => expect(BANK.some((c) => c.id.startsWith("quiz."))).toBe(false));
  it("nothing ships in reviewed mode", () => expect(shippableQuiz(QUIZ, "reviewed")).toEqual([]));
  it.each([
    ["two correct options", { options: [{ label_th: "ก", correct: true }, { label_th: "ข", correct: true }] }, "exactly one correct"],
    ["one option", { options: [{ label_th: "ก", correct: true }] }, "2–4 options"],
    ["unknown explain card", { explain_card_id: "nope.p000" }, "not in bank"],
    ["placeholder without mark", { question_th: "ทดสอบ" }, "PLACEHOLDER mark"],
    ["approved placeholder", { review: { status: "approved" } }, "never be approved"],
    ["bad id", { id: "Quiz-1" }, "bad id"],
  ])("rejects %s", (_n, over, msg) => {
    const errs = validateQuiz({ questions: [q(over)] } as unknown as Quiz, ids);
    expect(errs.join("\n")).toContain(msg);
  });
});
