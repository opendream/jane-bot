import type { AgeBand } from "./types";
import type { BankCard } from "./bank";

/** Start-screen picks: 15–17 / 18+ / ไม่อยากบอก. */
export type AgePick = "15-17" | "18+" | "unspecified";

/** ไม่อยากบอก and no answer both count as under 18. Only an explicit 18+ pick is adult. */
export type AgeState = AgePick | AgeBand | null | undefined;

export const AGE_REDIRECT_ID = "general.age_redirect.000";

export const AGE_REDIRECT_TEXT =
  "เรื่องนี้พี่เก็บไว้ตอบสำหรับคนอายุ 18 ปีขึ้นไปนะ ไม่ได้แปลว่าคำถามนี้ผิด สงสัยอะไรก็ถามได้เสมอ ถ้าอยากคุยเรื่องนี้กับคนที่เข้าใจวัยรุ่น โทรปรึกษา 1663 ได้ หรือให้พี่ช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ก็ได้";

export function isAdult(age: AgeState): boolean {
  return age === "18+" || age === "18-24" || age === "25+";
}

/** Handoff line only. Decline/skip stays ไม่ระบุ — gating still treats those as under 18. */
export function summaryAgeLabel(age: AgeState): string {
  if (isAdult(age)) return "18 ปีขึ้นไป";
  if (age === "15-17") return "ต่ำกว่า 18 ปี";
  return "ไม่ระบุ";
}

export function ageAllowed(c: BankCard, age: AgeState): boolean {
  if (c.age_min === 15) return true;
  return isAdult(age);
}

/** After a pick: 18+ card + under-18 user → fixed redirect. Never used for crisis or talk-to-a-person. */
export function afterPick(card: BankCard, age: AgeState, redirect: BankCard): BankCard {
  return ageAllowed(card, age) ? card : redirect;
}

export const AGE_REDIRECT_CARD: BankCard = {
  id: AGE_REDIRECT_ID,
  topic: "general",
  title_th: "สำหรับอายุ 18 ปีขึ้นไป",
  answer_th: AGE_REDIRECT_TEXT,
  key_facts: ["1663"],
  triggers: [],
  next: [],
  source_intents: [],
  source: [],
  review: { status: "draft", reviewer: null, reviewed_on: null, notes: "D5 fixed redirect, product copy" },
  last_reviewed: null,
  flags: ["hotline", "pii_checked"],
  referral: { offer: "soft", intents: ["other"] },
  links: [],
  age_min: 15,
  reword: false,
  licence: "Apache-2.0 (product copy, Opendream)",
};
