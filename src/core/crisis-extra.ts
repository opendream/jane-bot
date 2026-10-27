import type { CrisisCategory, CrisisResult } from "./types";
import { CRISIS_RULES, detectCrisis, MILD_MARKERS, TOPIC_MARKERS } from "./crisis";
import { compact, findPhrases } from "./text";

/**
 * Short DF-style Thai violence / harassment wording the pinned phrase lists missed
 * ("โดนซ้อม", "ผัวซ้อม", "เมียตี", "แฟนใช้กำลัง", "แทะโลม", "ข่มขู่"). All CONTEXTUAL: override, or banner in a
 * topic context (and for violence, with a mild qualifier). Matched on normalised, whitespace-stripped text.
 * Needs the qualified Thai crisis reviewer before shipping. Rules only — no model.
 *
 * Lives outside the pinned src/core/crisis.ts. detectCrisis is unchanged; this matcher only adds detections.
 */
// Hitting verbs, with negative lookaheads for everyday compounds: ตีตั๋ว/ตีความ/ตีสนิท/ตีกิน/ตีจาก/ตีหน้า…/ตีราคา/ตีพิมพ์/
// ตีเนียน/ตีมึน/ตีลังกา/ตีบ(ตัน) (ท่อนำไข่ตีบ is SRH)/ตีสอง… (clock times)/sports; ตบมือ/ตบยุง/ตบแต่ง; ต่อยมวย; เตะบอล; ทุบหลัง (massage).
const HIT =
  "(ตี(?!ตั๋ว|ความ|สนิท|กิน|จาก|หน้า|ราคา|พิมพ์|เนียน|มึน|ลังกา|บ|หนึ่ง|สอง|สาม|สี่|ห้า|กอล์ฟ|แบด|เทนนิส|ปิงปอง|กลอง|ฉิ่ง|ไข่|แปลง|เส้น|ตลาด|โจทย์|วง|ซี้|ฝีปาก|บท|ค่า|มูลค่า|ระฆัง|ฆ้อง)" +
  "|ตบ(?!มือ|ยุง|แต่ง|เท้า|ไหล่|บ่า)|ต่อย(?!มวย)|เตะ(?!บอล|ฟุตบอล|ตะกร้อ)|ข่วน|ซ้อม|ทุบ(?!หลัง|ไหล่|นวด|สถิติ|ทิ้ง)|กระทืบ|ถีบ(?!จักรยาน)|" +
  "ผลัก(?!ดัน|ให้ไป)|ชก(?!มวย)|กระชาก|บีบคอ|จิกหัว|จิกผม|ดึงผม|ทำร้าย(?!จิตใจ|ความรู้สึก|ใจ)|ใช้กำลัง(?!ใจ)|ลงไม้ลงมือ)";
// Who does it (partner, family, carer, generic "he/they"). "พี่" is left out: Jane calls herself พี่.
const AGENT = "(แฟน|ผัว|สามี|เมีย|ภรรยา|ภรรยา|พ่อเลี้ยง|แม่เลี้ยง|พ่อ|แม่|พี่ชาย|ลุง|ครู|เขา|ผู้ชาย|คนที่บ้าน|คนในบ้าน)";
// Up to 8 chars between subject and verb ("แฟนชอบใช้กำลัง", "ผัวเมาแล้วตี"), but never across a negation ("ไม่เคยตี").
const GAP = "(?:(?!ไม่).){0,8}?";
// Victim marker; ถูก excludes "correct/cheap/like" senses.
const VICTIM = "(โดน|ถูก(?!ต้อง|ใจ|กว่า|ที่|ไหม|มั้ย|และ|ๆ|ด้วย|วิธี|เวลา|สุด|มาก))";
const SEXUAL_TOUCH = "(จับ(หน้าอก|นม|ก้น|ของสงวน|จู๋|หี|จิ๋ม)|ลูบคลำ|ลวนลาม|แทะโลม|คุกคามทางเพศ|แอบถ่าย|ถ่ายคลิป|อนาจาร)";

export const EXTRA_CONTEXTUAL: Partial<Record<CrisisCategory, { id: string; re: RegExp }[]>> = {
  violence_danger: [
    { id: "agent_hits", re: new RegExp(`${AGENT}${GAP}${HIT}`) },
    { id: "victim_hit", re: new RegExp(`${VICTIM}${GAP}${HIT}`) },
    { id: "force_words", re: /ใช้กำลัง(?!ใจ)|ลงไม้ลงมือ|ใช้ความรุนแรง|ความรุนแรงในครอบครัว|กระทืบ/ },
    { id: "threat", re: /ข่มขู่|ขู่(จะ|ว่าจะ)?(ทำร้าย|ตี|ตบ|ซ้อม|ฆ่า|เอาชีวิต|ฟัน|แทง|ยิง)/ },
    { id: "harass_generic", re: /คุกคาม(?!ทางเพศ)|สะกดรอย|ตามตื๊อ/ },
  ],
  sexual_violence: [
    { id: "harass_sexual", re: /คุกคามทางเพศ|แทะโลม|อนาจาร|ลูบคลำ/ },
    { id: "victim_touch", re: new RegExp(`${VICTIM}${GAP}${SEXUAL_TOUCH}`) },
    { id: "image_threat", re: /ขู่.{0,10}?(ปล่อย|แฉ|ส่ง|ลง|โพสต์)(คลิป|รูป|ภาพ)|(ถ้า|จะ)(ปล่อย|แฉ)(คลิป|รูป|ภาพ)|เอา(คลิป|รูป|ภาพ).{0,6}?ไป(ลง|โพสต์|แฉ|ประจาน)/ },
    { id: "covert_photo", re: /แอบถ่าย|ถ่ายใต้กระโปรง/ },
    { id: "nonpartner_touch", re: new RegExp(`(พ่อเลี้ยง|ลุง|ครู|ญาติ|ผู้ชาย|คนแปลกหน้า|หัวหน้า|รุ่นพี่|คนในบ้าน|คนที่บ้าน)${GAP}(จับ(หน้าอก|นม|ก้น|ของสงวน|ตรงนั้น|ตัว(?!อย่าง))|ลูบ(ตัว|ขา|ก้น|หน้าอก|นม))`) },
  ],
};

/**
 * Pure synchronous extra-pattern matcher. Same contextual / banner rules as the original #17 hook
 * inside detectCrisis (topic → banner; mild qualifier banners violence_danger). No model, no I/O.
 */
export function matchCrisisExtra(text: string): CrisisResult {
  const topic = findPhrases(text, TOPIC_MARKERS).length > 0;
  const mild = findPhrases(text, MILD_MARKERS).length > 0;
  const squash = compact(text);
  const override: CrisisCategory[] = [];
  const banner: CrisisCategory[] = [];
  (Object.keys(CRISIS_RULES) as CrisisCategory[]).forEach((cat) => {
    const hits = (EXTRA_CONTEXTUAL[cat] ?? []).filter((x) => x.re.test(squash));
    if (!hits.length) return;
    let benign = topic;
    if (cat === "violence_danger" || cat === "medical_emergency") benign = benign || mild;
    (benign ? banner : override).push(cat);
  });
  return {
    crisis: override.length > 0,
    level: override.length ? "override" : banner.length ? "banner" : "none",
    categories: [...override, ...banner],
  };
}

/**
 * Turn-level crisis decision: flag crisis if detectCrisis fires OR matchCrisisExtra fires.
 * When detectCrisis already overrides, its category and ordering win. Extra only adds detections.
 */
export function detectCrisisWithExtra(text: string): CrisisResult {
  const pinned = detectCrisis(text);
  const extra = matchCrisisExtra(text);
  if (pinned.crisis || extra.crisis) return pinned.crisis ? pinned : extra;
  if (pinned.level === "banner") return pinned;
  return extra;
}
