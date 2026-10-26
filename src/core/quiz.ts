import quizData from "../data/bank/quiz.json";
import type { BankTopic, Issue } from "./bank";
import { BANK_TEXT_LICENCE, hoursIn } from "./bank";
import { isAdult, type AgeState } from "./age";
import { THAI_COPY_STATUS } from "../config";

/* D7 in-chat quiz. Items are PLACEHOLDER until Keng approves. Memory only; answers are never stored. */

export type QuizFormat = "true_false" | "multiple_choice" | "multiple_choice_chat" | "ordering";
export type QuizStatus = "PLACEHOLDER" | "draft" | "approved" | "rejected";

export interface QuizItem {
  id: string;
  format: QuizFormat;
  prompt_th: string;
  options: string[];
  options_shown_shuffled?: boolean;
  answer: number | number[];
  explanation_th: string;
  source: string;
  age_min: 15 | 18;
  licence: string;
  status: QuizStatus;
  decision?: string | null;
}

export const QUIZ_HOURS_1663 = "ปรึกษาฟรี ทุกวัน 09:00–21:00 น.";
export const QUIZ_HOURS_1663_RANGE = "09:00–21:00";
export const QUIZ_SESSION_LEN = 3;
export const QUIZ_CHIP = "ลองทำควิซ";
export const QUIZ_MENU = "ทำควิซ";
export const QUIZ_STOP = "หยุด";
export const QUIZ_NEXT = "ข้อถัดไป";
export const QUIZ_BACK = "กลับไปคุยต่อ";
export const QUIZ_WRAP = "ขอบคุณที่ลองทำควิซนะ กลับไปคุยกับพี่เจนต่อได้เลย";
export const QUIZ_OK = "ถูกต้อง";
export const QUIZ_NO = "ยังไม่ถูก";
/** Praise openers must not sit in explanation_th — the UI lead carries the verdict. */
export const QUIZ_PRAISE = /เก่งมาก|ใช่เลย|เยี่ยม(?:มาก)?|สุดยอด|well done/i;
export const QUIZ_CONFIRM_ORDER = "ยืนยันลำดับ";
export const QUIZ_UP = "เลื่อนขึ้น";
export const QUIZ_DOWN = "เลื่อนลง";
export const QUIZ_PLACEHOLDER_TAG = "PLACEHOLDER · ควิซตัวอย่าง ยังไม่ใช่ข้อมูลจริง";

export const QUIZ_TOPICS: Record<string, BankTopic[]> = {
  "QZ-01": ["contraception"],
  "QZ-02": ["pregnancy", "emergency_contraception"],
  "QZ-03": ["contraception"],
  "QZ-04": ["emergency_contraception"],
  "QZ-05": ["relationship_consent"],
  "QZ-06": ["relationship_consent"],
  "QZ-07": ["contraception"],
};

const FORMATS: readonly QuizFormat[] = ["true_false", "multiple_choice", "multiple_choice_chat", "ordering"];
const MUST_BE_18 = new Set(["QZ-02", "QZ-03"]);

export const QUIZ_ITEMS: QuizItem[] = (quizData as { items: QuizItem[] }).items;
export const QUIZ_FILE_LICENCE = (quizData as { licence?: string }).licence;

export function quizAgeAllowed(item: Pick<QuizItem, "age_min">, age: AgeState): boolean {
  return item.age_min === 15 || isAdult(age);
}

export function shippableQuiz(items: QuizItem[], copyStatus: "draft" | "reviewed"): QuizItem[] {
  return items.filter((q) => (copyStatus === "reviewed" ? q.status === "approved" : q.status !== "rejected"));
}

/** Live copy status for quiz serving. `?copy=reviewed|draft` is a DEV-only test hook; production always uses THAI_COPY_STATUS. */
export function quizCopyStatus(
  isDev: boolean = import.meta.env.DEV,
  search: string | null = typeof location !== "undefined" ? location.search : null,
): "draft" | "reviewed" {
  if (isDev && search) {
    try {
      const q = new URLSearchParams(search).get("copy");
      if (q === "reviewed" || q === "draft") return q;
    } catch { /* node */ }
  }
  return THAI_COPY_STATUS;
}

export function relatedTopics(id: string): BankTopic[] {
  return QUIZ_TOPICS[id] ?? [];
}

export function hasRelatedQuiz(topic: BankTopic | null | undefined, age: AgeState, items = QUIZ_ITEMS, copyStatus: "draft" | "reviewed" = quizCopyStatus()): boolean {
  if (!topic) return false;
  return shippableQuiz(items, copyStatus).some((q) => quizAgeAllowed(q, age) && relatedTopics(q.id).includes(topic));
}

/** Related items first (stable by id), then the rest. At most QUIZ_SESSION_LEN. */
export function pickQuizItems(
  age: AgeState,
  topic: BankTopic | null | undefined,
  items = QUIZ_ITEMS,
  n = QUIZ_SESSION_LEN,
  copyStatus: "draft" | "reviewed" = quizCopyStatus(),
): QuizItem[] {
  const eligible = shippableQuiz(items, copyStatus).filter((q) => quizAgeAllowed(q, age)).slice().sort((a, b) => a.id.localeCompare(b.id));
  const related = topic ? eligible.filter((q) => relatedTopics(q.id).includes(topic)) : [];
  const rest = eligible.filter((q) => !related.includes(q));
  return [...related, ...rest].slice(0, n);
}

export function isChoiceCorrect(item: QuizItem, picked: number): boolean {
  return typeof item.answer === "number" && picked === item.answer;
}

export function isOrderCorrect(item: QuizItem, order: number[]): boolean {
  const want = item.answer;
  return Array.isArray(want) && want.length === order.length && want.every((v, i) => v === order[i]);
}

export function moveIndex(order: number[], i: number, dir: -1 | 1): number[] {
  const j = i + dir;
  if (j < 0 || j >= order.length) return order.slice();
  const next = order.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Identity-avoiding shuffle of 0..n-1. Tests may pass a deterministic rng. */
export function shuffledIndexes(n: number, rng: () => number = Math.random): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a.every((v, i) => v === i)) [a[0], a[n - 1]] = [a[n - 1], a[0]];
  return a;
}

export type QuizPhase = "ask" | "explain" | "done";

export interface QuizSession {
  items: QuizItem[];
  index: number;
  phase: QuizPhase;
  order: number[];
  picked: number | null;
}

export function startQuiz(age: AgeState, topic: BankTopic | null | undefined, items = QUIZ_ITEMS, rng?: () => number, copyStatus: "draft" | "reviewed" = quizCopyStatus()): QuizSession | null {
  const picked = pickQuizItems(age, topic, items, QUIZ_SESSION_LEN, copyStatus);
  if (!picked.length) return null;
  return { items: picked, index: 0, phase: "ask", order: initialOrder(picked[0], rng), picked: null };
}

function initialOrder(item: QuizItem, rng?: () => number): number[] {
  const n = item.options.length;
  if (item.format === "ordering" && item.options_shown_shuffled) return shuffledIndexes(n, rng);
  return Array.from({ length: n }, (_, i) => i);
}

export function currentItem(s: QuizSession): QuizItem {
  return s.items[s.index];
}

export function answerChoice(s: QuizSession, picked: number): QuizSession {
  return { ...s, picked, phase: "explain" };
}

export function answerOrder(s: QuizSession): QuizSession {
  return { ...s, phase: "explain" };
}

export function advanceQuiz(s: QuizSession, rng?: () => number): QuizSession {
  const next = s.index + 1;
  if (next >= s.items.length) return { ...s, phase: "done" };
  const item = s.items[next];
  return { items: s.items, index: next, phase: "ask", order: initialOrder(item, rng), picked: null };
}

export function choiceWasCorrect(s: QuizSession): boolean {
  const item = currentItem(s);
  if (item.format === "ordering") return isOrderCorrect(item, s.order);
  return s.picked != null && isChoiceCorrect(item, s.picked);
}

function issue(id: string, rule: string, msg: string): Issue {
  return { level: "error", card: id, rule, msg };
}

function blob(q: QuizItem): string {
  return [q.prompt_th, q.explanation_th, ...(q.options ?? [])].join("\n");
}

/** Quiz-row validator (build). Blank Approved Audience is enforced at import (applyQuizReviewRow). */
export function validateQuizItems(items: QuizItem[], fileLicence = QUIZ_FILE_LICENCE, copyStatus: "draft" | "reviewed" = THAI_COPY_STATUS): Issue[] {
  const out: Issue[] = [];
  if (fileLicence !== BANK_TEXT_LICENCE) out.push(issue("quiz.json", "licence", `file licence must be ${BANK_TEXT_LICENCE}`));
  const seen = new Set<string>();
  for (const q of items ?? []) {
    const id = q?.id || "(no id)";
    if (copyStatus === "reviewed" && q.status !== "approved") {
      out.push(issue(id, "ship_gate", "THAI_COPY_STATUS is 'reviewed' but this quiz item is not approved"));
    }
    if (!/^QZ-\d{2}$/.test(q?.id ?? "")) out.push(issue(id, "id", "id must match QZ-nn"));
    if (seen.has(q.id)) out.push(issue(id, "id", "duplicate id"));
    seen.add(q.id);
    if (!FORMATS.includes(q.format)) out.push(issue(id, "format", "unknown format"));
    if (!q.prompt_th?.trim()) out.push(issue(id, "prompt_th", "prompt_th is required"));
    const opts = q.options ?? [];
    const min = q.format === "ordering" ? 3 : 2;
    const max = q.format === "ordering" ? 5 : 4;
    if (opts.length < min || opts.length > max) out.push(issue(id, "options", `needs ${min}–${max} options`));
    if (q.format === "ordering") {
      const a = q.answer;
      if (!Array.isArray(a) || a.length !== opts.length || new Set(a).size !== opts.length || a.some((i) => i < 0 || i >= opts.length)) {
        out.push(issue(id, "answer", "answer must be a permutation of option indexes"));
      }
    } else if (typeof q.answer !== "number" || q.answer < 0 || q.answer >= opts.length) {
      out.push(issue(id, "answer", "answer must be a valid option index"));
    }
    if (!q.explanation_th?.trim()) out.push(issue(id, "explanation_th", "explanation_th is required"));
    if (!q.source?.trim() || !/[A-Z]\.(\w+)/.test(q.source)) out.push(issue(id, "source", "Judies source id is required"));
    if (q.licence !== BANK_TEXT_LICENCE) out.push(issue(id, "licence", `licence must be ${BANK_TEXT_LICENCE}`));
    if (q.age_min !== 15 && q.age_min !== 18) out.push(issue(id, "age_min", "age_min must be 15 or 18"));
    if (MUST_BE_18.has(q.id) && q.age_min !== 18) out.push(issue(id, "age_min", `${q.id} must be 18+`));
    const text = blob(q);
    if (/100\s*%/.test(text)) out.push(issue(id, "banned", "no '100%'"));
    if (/บาท|฿/.test(text)) out.push(issue(id, "banned", "no prices"));
    if (text.includes("รวมวันหยุด")) out.push(issue(id, "hours_1663", "1663 hours must not include รวมวันหยุด"));
    if (text.includes("1663") && /\d{1,2}[:.]\d{2}/.test(text) && !text.includes(QUIZ_HOURS_1663)) {
      out.push(issue(id, "hours_1663", `1663 hours must be exactly ${QUIZ_HOURS_1663}`));
    }
    if (text.includes("1663")) {
      for (const h of hoursIn(text)) {
        if (h !== QUIZ_HOURS_1663_RANGE) out.push(issue(id, "hours_match_source", `hours ${h} do not match cited 1663 ${QUIZ_HOURS_1663_RANGE}`));
      }
    }
  }
  return out;
}
