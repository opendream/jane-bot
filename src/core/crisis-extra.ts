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
// ตี also refuses a preceding thanthakhat (ปาร์ตี้) and a following tone mark (ตี๋ / ปาร์ตี้).
const HIT_VERBS =
  "((?<!์)ตี(?![่้๊๋]|ตั๋ว|ความ|สนิท|กิน|จาก|หน้า|ราคา|พิมพ์|เนียน|มึน|ลังกา|บ|หนึ่ง|สอง|สาม|สี่|ห้า|กอล์ฟ|แบด|เทนนิส|ปิงปอง|กลอง|ฉิ่ง|ไข่|แปลง|เส้น|ตลาด|โจทย์|วง|ซี้|ฝีปาก|บท|ค่า|มูลค่า|ระฆัง|ฆ้อง)" +
  "|ตบ(?!มือ|ยุง|แต่ง|เท้า|ไหล่|บ่า)|ต่อย(?!มวย)|เตะ(?!บอล|ฟุตบอล|ตะกร้อ)|ทุบ(?!หลัง|ไหล่|นวด|สถิติ|ทิ้ง)|กระทืบ|ถีบ(?!จักรยาน)|" +
  "ผลัก(?!ดัน|ให้ไป)|ชก(?!มวย)|กระชาก|บีบคอ|จิกหัว|จิกผม|ดึงผม|ทำร้าย(?!จิตใจ|ความรู้สึก|ใจ)|ใช้กำลัง(?!ใจ)|ลงไม้ลงมือ)";
// ซ้อม only with a person object (ซ้อมหนู / ซ้อมฉัน), never ซ้อมบอล.
const ZOM_PERSON = "ซ้อม(?:หนู|ฉัน|เรา|เค้า)";
const HIT = `(?:${HIT_VERBS}|${ZOM_PERSON})`;
const HIT_AFTER_VICTIM = `(?:${HIT_VERBS}|ซ้อม)`;
// Who does it (partner, family, carer, generic "he/they"). "พี่" is left out: Jane calls herself พี่.
// Thai word-boundary: แม่/พ่อ are not the prefix of แม่ค้า/พ่อค้า; เขา is not the tail of ภูเขา.
const AGENT = "(แฟน|ผัว|สามี|เมีย|ภรรยา|ภรรยา|พ่อเลี้ยง|แม่เลี้ยง|พ่อ(?!ค้า)|แม่(?!ค้า|น้ำ|บ้าน|แรง|แบบ|พิมพ์)|พี่ชาย|ลุง|ครู|(?<!ภู)เขา|ผู้ชาย|คนที่บ้าน|คนในบ้าน)";
// Up to 8 chars between subject and verb ("แฟนชอบใช้กำลัง", "ผัวเมาแล้วตี").
const GAP = ".{0,8}?";
// Only treat ไม่ as negation when it directly marks the harm verb (ไม่ตี, ไม่เคยตี, ไม่ได้ตี), not ไม่พอใจ.
const NOT_NEGATED = "(?<!ไม่)(?<!ไม่เคย)(?<!ไม่ได้)(?<!ไม่ค่อย)";
// Victim marker; ถูก excludes "correct/cheap/like" senses.
const VICTIM = "(โดน|ถูก(?!ต้อง|ใจ|กว่า|ที่|ไหม|มั้ย|และ|ๆ|ด้วย|วิธี|เวลา|สุด|มาก))";
const SEXUAL_TOUCH = "(จับ(หน้าอก|นม|ก้น|ของสงวน|จู๋|หี|จิ๋ม)|ลูบคลำ|ลวนลาม|แทะโลม|คุกคามทางเพศ|แอบถ่าย)";
const CLIP = "(คลิป|รูป|ภาพ)";
const LEAK = "(ปล่อย|แฉ|ส่ง|ลง|โพสต์|ประจาน)";
const SEX_CLIP = "(โป๊|เปลือย|อนาจาร|แก้ผ้า|เปลือยกาย)";
const ME = "(หนู|ฉัน|เรา)";
const IMAGE_THREAT =
  `(ขู่|ข่มขู่).{0,12}?${LEAK}?${CLIP}` +
  `|จะ${LEAK}${CLIP}.{0,20}?ถ้า` +
  `|ถ้า.{0,16}?(จะ)?${LEAK}${CLIP}` +
  `|เอา${CLIP}.{0,6}?ไป(ลง|โพสต์|แฉ|ประจาน)` +
  `|${CLIP}${SEX_CLIP}.{0,10}?${ME}` +
  `|${ME}.{0,12}?${CLIP}${SEX_CLIP}` +
  `|(ถ่าย|ปล่อย)${CLIP}.{0,12}?(ตอน)?(อาบน้ำ|แก้ผ้า|${SEX_CLIP})`;

function uniqueCats(cats: CrisisCategory[]): CrisisCategory[] {
  return [...new Set(cats)];
}

export const EXTRA_CONTEXTUAL: Partial<Record<CrisisCategory, { id: string; re: RegExp }[]>> = {
  violence_danger: [
    { id: "agent_hits", re: new RegExp(`${AGENT}${GAP}${NOT_NEGATED}${HIT}|${ZOM_PERSON}`) },
    { id: "victim_hit", re: new RegExp(`${VICTIM}${GAP}${NOT_NEGATED}${HIT_AFTER_VICTIM}`) },
    { id: "force_words", re: /ใช้กำลัง(?!ใจ)|ลงไม้ลงมือ|ใช้ความรุนแรง|ความรุนแรงในครอบครัว|กระทืบ/ },
    { id: "threat", re: /ข่มขู่|ขู่(จะ|ว่าจะ)?(ทำร้าย|ตี|ตบ|ซ้อม|ฆ่า|เอาชีวิต|ฟัน|แทง|ยิง)/ },
    { id: "harass_generic", re: /คุกคาม(?!ทางเพศ)|สะกดรอย|ตามตื๊อ/ },
  ],
  sexual_violence: [
    { id: "harass_sexual", re: new RegExp(`คุกคามทางเพศ|แทะโลม|ลูบคลำ|${ME}.{0,10}?อนาจาร|อนาจาร.{0,10}?${ME}`) },
    { id: "victim_touch", re: new RegExp(`${VICTIM}${GAP}${NOT_NEGATED}${SEXUAL_TOUCH}`) },
    { id: "image_threat", re: new RegExp(IMAGE_THREAT) },
    { id: "covert_photo", re: /แอบถ่าย|ถ่ายใต้กระโปรง/ },
    { id: "nonpartner_touch", re: new RegExp(`(พ่อเลี้ยง|ลุง|ครู|ญาติ|ผู้ชาย|คนแปลกหน้า|หัวหน้า|รุ่นพี่|คนในบ้าน|คนที่บ้าน)${GAP}${NOT_NEGATED}(จับ(หน้าอก|นม|ก้น|ของสงวน|ตรงนั้น|ตัว(?!อย่าง))|ลูบ(ตัว|ขา|ก้น|หน้าอก|นม))`) },
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
 * Base categories are always kept, in base order, then extra categories not already present.
 */
export function detectCrisisWithExtra(text: string): CrisisResult {
  const pinned = detectCrisis(text);
  const extra = matchCrisisExtra(text);
  const categories = uniqueCats([...pinned.categories, ...extra.categories]);
  if (pinned.crisis || extra.crisis) {
    return { crisis: true, level: "override", categories };
  }
  if (pinned.level === "banner" || extra.level === "banner") {
    return { crisis: false, level: "banner", categories };
  }
  return { crisis: false, level: "none", categories: [] };
}
