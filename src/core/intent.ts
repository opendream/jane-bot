import type { Intent, IntentResult } from "./types";
import { compact, findPhrases, normalize } from "./text";

/**
 * Rule-based need classifier (fallback and default). DRAFT keyword lists, Thai review pending.
 * Weighted: strong phrases count 2, weak words count 1.
 */
interface Rule {
  strong: readonly string[];
  weak: readonly string[];
  /** Phrases removed before matching this intent (e.g. "ปวดท้อง" = stomach ache, not pregnancy). */
  exclude?: readonly string[];
  /** Weak words only count when at least one strong phrase matched. */
  weakNeedsStrong?: boolean;
}

export const INTENT_RULES: Record<Exclude<Intent, "other">, Rule> = {
  emergency_contraception: {
    strong: ["ยาคุมฉุกเฉิน", "ยาเม็ดคุมฉุกเฉิน", "ถุงยางแตก", "ถุงยางรั่ว", "ถุงยางหลุด", "ไม่ได้ป้องกัน",
      "ไม่ได้ใส่ถุง", "ไม่ใส่ถุง", "ลืมกินยาคุม", "ยาคุมแบบฉุกเฉิน", "postinor", "morning after", "emergency contraception"],
    weak: ["เมื่อคืน", "เมื่อวาน", "72 ชั่วโมง", "ภายในกี่ชั่วโมง"],
    weakNeedsStrong: true,
  },
  pregnancy: {
    strong: ["ท้องไม่พร้อม", "กลัวท้อง", "ตั้งครรภ์", "ตรวจครรภ์", "ที่ตรวจครรภ์", "ประจำเดือนไม่มา", "ประจำเดือนมาช้า",
      "ประจำเดือนขาด", "เมนส์ไม่มา", "เมนส์มาช้า", "เมนส์ขาด", "ขึ้นสองขีด", "ขึ้น2ขีด", "pregnant", "period is late"],
    weak: ["ท้อง", "ประจำเดือน", "เมนส์", "แท้ง", "ยุติการตั้งครรภ์"],
    exclude: ["ปวดท้อง", "ท้องเสีย", "ท้องอืด", "ท้องผูก"],
  },
  contraception: {
    strong: ["คุมกำเนิด", "ยาคุม", "ฝังยาคุม", "ห่วงอนามัย", "ยาฉีดคุม", "แผ่นแปะคุม", "ถุงยางอนามัย", "contraception", "birth control", "condom"],
    weak: ["ถุงยาง", "ป้องกันการท้อง", "ไม่อยากท้อง"],
  },
  sti_hiv: {
    strong: ["เอชไอวี", "hiv", "เอดส์", "โรคติดต่อทางเพศ", "กามโรค", "หนองใน", "ซิฟิลิส", "เริม", "หูดหงอนไก่",
      "เพร็พ", "prep", "เป๊ป", "pep", "ตรวจเลือด", "sti", "std"],
    weak: ["ตกขาว", "คันช่องคลอด", "แสบเวลาฉี่", "ฉี่แสบ", "มีตุ่ม", "ติดเชื้อ"],
  },
  relationship_consent: {
    strong: ["ยินยอม", "ไม่อยากมีเซ็กส์", "ไม่อยากมีอะไรกับแฟน", "แฟนกดดัน", "แฟนบังคับ", "ปฏิเสธแฟน", "บอกแฟนให้ใส่ถุง",
      "consent", "ขอให้แฟนใส่ถุงยาง"],
    weak: ["แฟน", "ความสัมพันธ์", "กดดัน", "หึง", "เลิกกัน", "คนคุย"],
  },
  mental_health: {
    strong: ["ซึมเศร้า", "เครียดมาก", "นอนไม่หลับ", "วิตกกังวล", "ไม่มีใครเข้าใจ", "รู้สึกแย่มาก", "depressed", "anxious"],
    weak: ["เครียด", "เศร้า", "กังวล", "ร้องไห้", "เหงา", "ไม่สบายใจ", "ไม่กล้าบอกใคร", "กลัว"],
  },
  violence: {
    strong: ["แบล็กเมล์", "แบล็คเมล์", "ขู่ปล่อยคลิป", "ขู่ปล่อยรูป", "คลิปหลุด", "รูปหลุด", "ถูกขู่", "โดนขู่", "ความรุนแรง"],
    weak: ["ขู่", "ทำร้าย"],
  },
};

/** Tie-break order when scores are equal (more specific / time-sensitive first). */
const PRIORITY: Intent[] = ["emergency_contraception", "violence", "pregnancy", "sti_hiv", "contraception",
  "relationship_consent", "mental_health", "other"];

export function classifyNeed(text: string): IntentResult {
  const base = normalize(text);
  const scores: Partial<Record<Intent, number>> = {};
  (Object.keys(INTENT_RULES) as (keyof typeof INTENT_RULES)[]).forEach((intent) => {
    const r = INTENT_RULES[intent];
    let local = base;
    if (r.exclude?.length) {
      // Space-insensitive exclusion ("ปวด ท้อง" == "ปวดท้อง"); "|" breaks any match across the cut.
      local = compact(text);
      for (const ex of r.exclude) local = local.split(compact(ex)).join("|");
    }
    const strong = findPhrases(local, r.strong).length;
    const weakRaw = findPhrases(local, r.weak).length;
    const weak = r.weakNeedsStrong && strong === 0 ? 0 : weakRaw;
    const s = strong * 2 + weak;
    if (s > 0) scores[intent] = s;
  });
  // Emergency contraception implies a pregnancy worry too.
  if (scores.emergency_contraception && !scores.pregnancy) scores.pregnancy = 1;
  const ranked = (Object.keys(scores) as Intent[])
    .filter((i) => (scores[i] ?? 0) >= 1)
    .sort((a, b) => (scores[b]! - scores[a]!) || PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  return { intents: ranked.length ? ranked : ["other"], scores, source: "rules" };
}
