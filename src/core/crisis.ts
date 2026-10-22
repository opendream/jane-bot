import type { CrisisCategory, CrisisResult } from "./types";
import { findPhrases } from "./text";

/**
 * DRAFT crisis phrase list — must be reviewed by a qualified Thai SRH/safety reviewer before filming.
 * Bias: false positives are acceptable (crisis card is shown with an option to continue);
 * false negatives are not. Runs before any model and never depends on it.
 */
export const CRISIS_PHRASES: Record<CrisisCategory, readonly string[]> = {
  self_harm: [
    "อยากตาย", "ฆ่าตัวตาย", "ไม่อยากมีชีวิตอยู่", "ไม่อยากอยู่แล้ว", "ไม่อยากอยู่บนโลก",
    "จบชีวิต", "ทำร้ายตัวเอง", "กรีดแขน", "กรีดข้อมือ", "กินยาเกินขนาด", "กินยาตาย",
    "อยากหายไปจากโลก", "ตายไปซะ", "โดดตึก", "ผูกคอ",
    "kill myself", "suicide", "self harm", "self-harm", "want to die",
  ],
  sexual_violence: [
    "ข่มขืน", "ถูกข่มขืน", "โดนข่มขืน", "ถูกบังคับมีเซ็กส์", "โดนบังคับมีเซ็กส์",
    "ถูกบังคับให้มีเพศสัมพันธ์", "บังคับให้มีเพศสัมพันธ์", "ถูกล่วงละเมิดทางเพศ", "โดนล่วงละเมิด",
    "ล่วงละเมิดทางเพศ", "ถูกลวนลาม", "โดนลวนลาม", "ถูกมอมยา", "โดนมอมยา",
    "rape", "raped", "sexually assaulted",
  ],
  violence_danger: [
    "ถูกทำร้าย", "โดนทำร้าย", "ถูกตบ", "โดนตบ", "ถูกตี", "โดนตี", "ทุบตี", "ถูกต่อย", "โดนต่อย",
    "ขู่จะฆ่า", "ขู่ฆ่า", "ถูกขังไว้", "โดนขังไว้", "ไม่ปลอดภัยตอนนี้", "กำลังตามมา", "กลัวเขาจะทำร้าย",
    "in danger", "being hurt", "he hits me",
  ],
  medical_emergency: [
    "เลือดออกเยอะมาก", "เลือดออกมาก", "เลือดไม่หยุด", "ตกเลือด", "หมดสติ", "เป็นลม",
    "ปวดท้องรุนแรง", "ปวดท้องมากจนทนไม่ไหว", "หายใจไม่ออก", "ชักเกร็ง",
    "heavy bleeding", "unconscious", "can't breathe",
  ],
};

/** Ordered numbers to show first for each category. All four lines are always shown. */
export const CRISIS_PRIORITY: Record<CrisisCategory, readonly string[]> = {
  self_harm: ["1323", "1669", "1300", "191"],
  sexual_violence: ["1300", "191", "1669", "1323"],
  violence_danger: ["191", "1300", "1669", "1323"],
  medical_emergency: ["1669", "191", "1323", "1300"],
};

export function detectCrisis(text: string): CrisisResult {
  const categories: CrisisCategory[] = [];
  (Object.keys(CRISIS_PHRASES) as CrisisCategory[]).forEach((cat) => {
    if (findPhrases(text, CRISIS_PHRASES[cat]).length) categories.push(cat);
  });
  return { crisis: categories.length > 0, categories };
}

export function crisisOrder(categories: CrisisCategory[]): string[] {
  const base = ["1323", "1300", "1669", "191"];
  if (!categories.length) return base;
  const first = CRISIS_PRIORITY[categories[0]];
  return [...first, ...base.filter((n) => !first.includes(n))];
}
