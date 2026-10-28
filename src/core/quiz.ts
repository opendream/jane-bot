/* Quiz shell (plan v2 §5 "quiz and endings"). D7 is pending: only PLACEHOLDER questions exist, they are
 * validated here, and the UI does not show a quiz yet. Never ships in "reviewed" copy mode. */
import quizData from "../data/bank/quiz.json";
import type { ReviewStatus } from "./bank";

export interface QuizOption { label_th: string; correct: boolean }
export interface QuizQuestion {
  id: string; placeholder?: boolean; question_th: string; options: QuizOption[];
  /** The card that explains the answer (must exist in the bank). */
  explain_card_id: string;
  review: { status: ReviewStatus };
}
export interface Quiz { questions: QuizQuestion[] }

export const QUIZ: Quiz = quizData as unknown as Quiz;

/** Errors as "id: message" strings (empty = valid). */
export function validateQuiz(quiz: Quiz, cardIds: ReadonlySet<string>): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const q of quiz.questions) {
    if (!/^quiz\.[a-z]?\d{3}$/.test(q.id)) errs.push(`${q.id}: bad id`);
    if (seen.has(q.id)) errs.push(`${q.id}: duplicate id`);
    seen.add(q.id);
    if (!q.question_th?.trim()) errs.push(`${q.id}: empty question`);
    if (q.options.length < 2 || q.options.length > 4) errs.push(`${q.id}: needs 2–4 options`);
    if (q.options.filter((o) => o.correct).length !== 1) errs.push(`${q.id}: exactly one correct option`);
    if (!cardIds.has(q.explain_card_id)) errs.push(`${q.id}: explain_card_id not in bank`);
    if (q.placeholder && !q.question_th.includes("PLACEHOLDER")) errs.push(`${q.id}: placeholder must carry the PLACEHOLDER mark`);
    if (q.placeholder && q.review.status === "approved") errs.push(`${q.id}: placeholder can never be approved`);
  }
  return errs;
}

/** Questions that may be shown: none in "reviewed" mode unless approved and not placeholders. */
export function shippableQuiz(quiz: Quiz, copyStatus: "draft" | "reviewed"): QuizQuestion[] {
  return quiz.questions.filter((q) => (copyStatus === "reviewed" ? q.review.status === "approved" && !q.placeholder : q.review.status !== "rejected"));
}
