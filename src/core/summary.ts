import type { AgeBand, Intent, Service } from "./types";
import { INTENT_LABEL_TH } from "./referral";
// @ts-ignore shared span-merge redaction (rules run on the original text only)
import { stripPII as stripPIIImpl, toArabic } from "../../scripts/bank/pii-patterns.mjs";

/** Max characters kept from her own words (≈ one line). */
export const MAX_NEED_CHARS = 140;

/** Same implementation as scripts/bank/pii-patterns.mjs — staff-handoff and validator share it. */
export const stripPII: (input: string, opts?: { allowHandles?: string[]; allowHosts?: string[] }) => string = stripPIIImpl;

/** Thai digits ๐-๙ → ASCII 0-9. Length-preserving so match indices map back to the original. */
export function toArabicDigits(s: string): string {
  return toArabic(s);
}

export const WANT_TH: Record<Intent, string> = {
  pregnancy: "อยากคุยกับเจ้าหน้าที่เรื่องการตรวจครรภ์และทางเลือก",
  emergency_contraception: "อยากรู้ว่าควรทำอย่างไรต่อและหายาคุมฉุกเฉินได้ที่ไหน",
  contraception: "อยากได้คำแนะนำเรื่องวิธีคุมกำเนิดที่เหมาะกับตัวเอง",
  sti_hiv: "อยากรู้ว่าควรตรวจอะไรและตรวจได้ที่ไหนแบบเป็นความลับ",
  relationship_consent: "อยากคุยกับคนที่เข้าใจเรื่องความสัมพันธ์และการปฏิเสธ",
  mental_health: "อยากมีคนรับฟังและช่วยคิดว่าจะทำอย่างไรต่อ",
  violence: "อยากได้ความช่วยเหลือและคำแนะนำว่าจะปลอดภัยได้อย่างไร",
  other: "อยากคุยกับเจ้าหน้าที่",
};

const AGE_TH: Record<AgeBand, string> = {
  "15-17": "15–17 ปี", "18-24": "18–24 ปี", "25+": "25 ปีขึ้นไป", unspecified: "ไม่ระบุ",
};

export interface SummaryInput {
  service: Service;
  needText: string;
  intent: Intent;
  ageBand: AgeBand;
}

export function preferredChannel(service: Service): string {
  const t = service.channels[0]?.type;
  return t === "phone" ? "โทรศัพท์" : t === "line" ? "แชท LINE" : t === "facebook" ? "แชทเฟซบุ๊ก" : "ออนไลน์";
}

/** Shorten on a word-ish boundary (Thai has no spaces, so fall back to a hard cut). */
export function clip(s: string, max = MAX_NEED_CHARS): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + "…";
}

/** Deterministic template summary (spec §4.5). The model may later rephrase, never add facts. */
export function draftSummary({ service, needText, intent, ageBand }: SummaryInput): string {
  const need = clip(stripPII(needText)) || INTENT_LABEL_TH[intent];
  return [
    `ถึงเจ้าหน้าที่ ${service.name_th}`,
    `- เรื่องที่อยากปรึกษา: ${need}`,
    `- ช่วงอายุ: ${AGE_TH[ageBand]}`,
    `- สิ่งที่อยากได้: ${WANT_TH[intent]}`,
    `- ช่องทางที่สะดวก: ${preferredChannel(service)}`,
    `(สรุปนี้ผู้ใช้อ่านและยืนยันเองแล้ว)`,
  ].join("\n");
}

/** Final pass on whatever the user approves (she may have typed PII into the editor). */
export function finalizeSummary(edited: string): string {
  return edited.split("\n").map((l) => (l.startsWith("ถึงเจ้าหน้าที่") ? l : stripPII(l))).join("\n").trim();
}
