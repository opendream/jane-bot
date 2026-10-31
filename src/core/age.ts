import type { AgeBand } from "./types";
import type { BankCard } from "./bank";

/**
 * D5 age gate (updated 27 Oct 2026, Keng / rule 13).
 *
 * Start-screen picks are FOUR bands: 15–17, 18–24, 25+, ไม่อยากบอก.
 * This replaces the 23 Oct three-band merge (15–17 / 18+ / ไม่อยากบอก).
 *
 * Rule 21 still splits at 18: only 18–24 and 25+ count as adult. 15–17,
 * ไม่อยากบอก, and no answer never see an 18+ card; they get AGE_REDIRECT_CARD.
 * Crisis, referral, welcome, fallback, refusal, ending and this redirect stay 15+.
 */
export type AgePick = "15-17" | "18-24" | "25+" | "unspecified";

/** ไม่อยากบอก and no answer both count as under 18. 18–24 and 25+ (and a legacy "18+" pick) are adult. */
export type AgeState = AgePick | AgeBand | "18+" | null | undefined;

export const AGE_REDIRECT_ID = "general.age_redirect.000";

export const AGE_REDIRECT_TEXT =
  "เรื่องนี้เราเก็บไว้ตอบสำหรับคนอายุ 18 ปีขึ้นไปนะคะ ไม่ได้แปลว่าคำถามนี้ผิด สงสัยอะไรก็ถามได้เสมอ ถ้าอยากคุยเรื่องนี้กับคนที่เข้าใจวัยรุ่น โทรปรึกษา 1663 ได้ หรือให้เราช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ก็ได้ค่ะ";

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
  review: { status: "approved", reviewer: "Keng", reviewed_on: "2026-10-27", notes: "Answer #36 Approve. Rule 21 redirect; four start-screen bands, split still at 18." },
  last_reviewed: "2026-10-27",
  flags: ["hotline", "pii_checked"],
  referral: { offer: "soft", intents: ["other"] },
  links: [],
  age_min: 15,
  reword: false,
  licence: "Apache-2.0 (product copy, Opendream)",
};
