import type { CrisisCategory, CrisisResult } from "./types";
import { findPhrases, normalize } from "./text";

/**
 * DRAFT crisis phrase list — must be reviewed by a qualified Thai SRH/safety reviewer before filming.
 * Runs before any model and never depends on it.
 *
 * Two tiers:
 *  - "override": full-screen crisis card, the referral flow stops.
 *  - "banner":   the phrase appears only in a benign context (fiction/news/school topic, a mild qualifier,
 *                or "ไม่อยากอยู่แล้ว + place"). The referral flow continues, but a crisis strip with
 *                the matching helplines stays on top.
 * ALWAYS phrases (first-person desire to die, victim forms of sexual violence) override even in a benign context.
 */
interface CategoryRules {
  /** Override in any context. */
  always: readonly string[];
  /** Override unless a benign context applies to this category, then banner. */
  contextual: readonly string[];
}

export const CRISIS_RULES: Record<CrisisCategory, CategoryRules> = {
  self_harm: {
    always: [
      "อยากตาย", "ไม่อยากมีชีวิตอยู่", "ไม่อยากอยู่บนโลก", "คิดจะฆ่าตัวตาย", "อยากฆ่าตัวตาย", "จะฆ่าตัวตาย",
      "ทำร้ายตัวเอง", "กรีดแขน", "กรีดข้อมือ", "กินยาเกินขนาด", "กินยาตาย", "อยากหายไปจากโลก", "ผูกคอตาย",
      "kill myself", "want to die", "self harm", "self-harm",
    ],
    contextual: ["ฆ่าตัวตาย", "ไม่อยากอยู่แล้ว", "จบชีวิต", "ตายไปซะ", "โดดตึก", "suicide"],
  },
  sexual_violence: {
    always: [
      "ถูกข่มขืน", "โดนข่มขืน", "ถูกบังคับมีเซ็กส์", "โดนบังคับมีเซ็กส์", "ถูกบังคับให้มีเพศสัมพันธ์",
      "ถูกล่วงละเมิดทางเพศ", "โดนล่วงละเมิด", "ถูกลวนลาม", "โดนลวนลาม", "ถูกมอมยา", "โดนมอมยา",
      "raped", "sexually assaulted",
    ],
    contextual: ["ข่มขืน", "บังคับให้มีเพศสัมพันธ์", "ล่วงละเมิดทางเพศ", "ลวนลาม", "มอมยา", "rape"],
  },
  violence_danger: {
    always: ["ไม่ปลอดภัยตอนนี้", "มีคนกำลังตามมา", "เขากำลังตามมา", "กลัวเขาจะทำร้าย", "in danger", "he hits me"],
    contextual: [
      "ถูกทำร้าย", "โดนทำร้าย", "ถูกตบ", "โดนตบ", "ถูกตี", "โดนตี", "ทุบตี", "ถูกต่อย", "โดนต่อย",
      "ขู่จะฆ่า", "ขู่ฆ่า", "ถูกขังไว้", "โดนขังไว้", "being hurt",
      // active forms ("แฟนตบหน้าหนู") — added after the held-out check missed one
      "ตบหน้า", "ตบหัว", "ต่อยหน้า", "บีบคอ", "ทำร้ายร่างกาย", "ตบหนู", "ตีหนู", "ทำร้ายหนู", "ตบฉัน", "ตีฉัน", "ทำร้ายฉัน",
    ],
  },
  medical_emergency: {
    always: ["เลือดไม่หยุด", "เลือดออกเยอะมาก", "ตกเลือด", "หมดสติ", "ชักเกร็ง", "heavy bleeding", "unconscious"],
    contextual: ["เลือดออกมาก", "ปวดท้องรุนแรง", "ปวดท้องมากจนทนไม่ไหว", "หายใจไม่ออก", "can't breathe"],
  },
};

/** Back-compat flat view (all phrases per category). */
export const CRISIS_PHRASES: Record<CrisisCategory, readonly string[]> = Object.fromEntries(
  Object.entries(CRISIS_RULES).map(([k, v]) => [k, [...v.always, ...v.contextual]]),
) as unknown as Record<CrisisCategory, readonly string[]>;

/** Fiction, news, school or game context: the text is about a topic, not (necessarily) about her. */
export const TOPIC_MARKERS = [
  "ซีรีส์", "ซีรี่ส์", "หนัง", "ละคร", "นิยาย", "การ์ตูน", "อนิเมะ", "เกม", "ตัวละคร", "ฉาก", "ตัวร้าย", "พระเอก", "นางเอก",
  "รายงาน", "การบ้าน", "วิชา", "ครูสอน", "เรียนเรื่อง", "ข่าว", "คืออะไร", "แบบไหนเรียกว่า", "หมายถึงอะไร", "กฎหมาย",
  "ความรู้", "มวย", "กีฬา", "squad", "movie", "series", "game",
];
/** Mild qualifiers: only downgrade physical-danger and medical phrases. */
export const MILD_MARKERS = ["นิดหน่อย", "นิดนึง", "เล็กน้อย", "แป๊บเดียว", "เกือบ", "หายแล้ว", "หยุดแล้ว", "ดีขึ้นแล้ว", "ออกมาแล้ว", "ทุกเดือน", "กว่าปกติ"];
/** "ไม่อยากอยู่แล้ว" followed by a place/group = wants to move, not to die. */
const PLACE_AFTER_NOT_WANT_STAY = /ไม่อยากอยู่แล้ว\s*(หอ|ห้อง|ที่นี่|บ้านนี้|บริษัท|โรงเรียน|ทีม|กลุ่ม|ชมรม|คณะ|ไลน์กลุ่ม)/;

/** Helplines for a single-category crisis screen (owner ruling 23 Oct 2026). Mixed/unclear → all four. */
export const CRISIS_PRIORITY: Record<CrisisCategory, readonly string[]> = {
  self_harm: ["1323", "1669"],
  sexual_violence: ["191", "1300"],
  violence_danger: ["1300", "191"],
  medical_emergency: ["1669"],
};

const ALL_CRISIS_NUMBERS = ["1323", "1300", "1669", "191"];

/**
 * Word-order-tolerant forms the phrase lists missed in e2e ("ถูกบังคับให้มีเซ็กส์").
 * Matched on whitespace-stripped text. `always` = victim form; `contextual` = any "forced sex" wording.
 */
const SEX_ACT = "(มีเซ็กส์|มีเซ็ก|มีเพศสัมพันธ์|มีอะไรด้วย|นอนด้วย|ร่วมเพศ|ทำเรื่องอย่างว่า|sex)";
const PATTERNS: Partial<Record<CrisisCategory, { always?: RegExp; contextual?: RegExp }>> = {
  sexual_violence: {
    always: new RegExp(`(ถูก|โดน)[^ ]{0,8}?บังคับ(ให้)?(ต้อง)?${SEX_ACT}`),
    contextual: new RegExp(`บังคับ(ให้)?(ต้อง)?${SEX_ACT}`),
  },
};

export function detectCrisis(text: string): CrisisResult {
  const norm = normalize(text);
  const topic = findPhrases(text, TOPIC_MARKERS).length > 0;
  const mild = findPhrases(text, MILD_MARKERS).length > 0;
  const override: CrisisCategory[] = [];
  const banner: CrisisCategory[] = [];
  (Object.keys(CRISIS_RULES) as CrisisCategory[]).forEach((cat) => {
    const r = CRISIS_RULES[cat];
    // "การถูก…/การโดน…" is a noun phrase ("being harassed" as a topic), so it is only contextual.
    const forAlways = topic ? text.replace(/การ\s*(ถูก|โดน)/g, "การ") : text;
    const pat = PATTERNS[cat];
    const squash = (t: string) => normalize(t).replace(/\s+/g, "");
    if (findPhrases(forAlways, r.always).length || pat?.always?.test(squash(forAlways))) { override.push(cat); return; }
    const hits = findPhrases(text, r.contextual);
    if (!hits.length && pat?.contextual?.test(squash(text))) hits.push("บังคับ…(pattern)");
    if (!hits.length) return;
    let benign = topic;
    if (cat === "violence_danger" || cat === "medical_emergency") benign = benign || mild;
    if (cat === "self_harm" && hits.every((h) => h === "ไม่อยากอยู่แล้ว") && PLACE_AFTER_NOT_WANT_STAY.test(norm.replace(/\s+/g, ""))) benign = true;
    (benign ? banner : override).push(cat);
  });
  const categories = [...override, ...banner];
  return { crisis: override.length > 0, level: override.length ? "override" : banner.length ? "banner" : "none", categories };
}

export function crisisOrder(categories: CrisisCategory[]): string[] {
  const unique = [...new Set(categories)];
  if (unique.length !== 1) return [...ALL_CRISIS_NUMBERS];
  return [...CRISIS_PRIORITY[unique[0]]];
}

/** Female-officer line is only on the sexual-violence screen, never on mixed/unclear or other categories. */
export function showCrisisOfficerLine(categories: CrisisCategory[]): boolean {
  const unique = [...new Set(categories)];
  return unique.length === 1 && unique[0] === "sexual_violence";
}
