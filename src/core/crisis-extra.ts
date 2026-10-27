import type { CrisisCategory, CrisisResult } from "./types";
import { CRISIS_RULES, detectCrisis, MILD_MARKERS, TOPIC_MARKERS } from "./crisis";
import { compact, findPhrases } from "./text";

/**
 * Extra crisis rules (outside pinned crisis.ts). Shapes:
 *
 * 1. Violence = (harm verb with Thai word boundaries) AND (a person agent
 *    or a victim marker). Negation only when ไม่, ไม่เคย or ไม่ได้ sits
 *    directly before the verb.
 *
 * 2. ตี is not followed by น, a tone mark, ตัว…ห่าง, or กลับ, and is not
 *    inside ปาร์ตี้ or ตี๋. Other hit verbs keep their everyday-compound
 *    lookaheads (ตีตั๋ว, ตบมือ, เตะบอล, …).
 *
 * 3. ซ้อม: a person agent before the verb is enough (no object needed),
 *    except sport/music (แข่ง, บอล, ดนตรี, เต้น, ร้อง). ถูก/โดนซ้อม also
 *    needs a person agent or a harm word (จนเจ็บ, จนช้ำ, ทุบ, ทำร้าย,
 *    จนตัวเขียว). ข่วน needs a person agent (แมวข่วน is not).
 *
 * 4. Images/clips → sexual_violence only with explicit threat/coercion
 *    (ขู่, ข่มขู่, แบล็กเมล์, จะปล่อย|ลง … ถ้าไม่ …, เอาไปประจาน) or
 *    sexual content (โป๊, เปลือย, ตอนอาบน้ำ, ตอนมีอะไรกัน, อนาจาร with
 *    a first-person marker). ตามตื๊อ is not violence.
 *
 * Matched on compact text. Contextual: topic → banner; mild qualifier
 * banners violence. Lives outside pinned crisis.ts. Rules only — no model.
 */

// Hitting verbs. ตี refuses a preceding thanthakhat (ปาร์ตี้) and a following
// tone mark (ตี๋), น (ตีน), ตัว…ห่าง (ตีตัวออกห่าง), or กลับ (ตีกลับ).
const HIT_VERBS =
  "((?<!์)ตี(?![่้๊๋น]|กลับ|ตัว.{0,6}?ห่าง|ตั๋ว|ความ|สนิท|กิน|จาก|หน้า|ราคา|พิมพ์|เนียน|มึน|ลังกา|บ|หนึ่ง|สอง|สาม|สี่|ห้า|กอล์ฟ|แบด|เทนนิส|ปิงปอง|กลอง|ฉิ่ง|ไข่|แปลง|เส้น|ตลาด|โจทย์|วง|ซี้|ฝีปาก|บท|ค่า|มูลค่า|ระฆัง|ฆ้อง)" +
  "|ตบ(?!มือ|ยุง|แต่ง|เท้า|ไหล่|บ่า)|ต่อย(?!มวย)|เตะ(?!บอล|ฟุตบอล|ตะกร้อ)|ทุบ(?!หลัง|ไหล่|นวด|สถิติ|ทิ้ง)|กระทืบ|ถีบ(?!จักรยาน)|" +
  "ผลัก(?!ดัน|ให้ไป)|ชก(?!มวย)|กระชาก|บีบคอ|จิกหัว|จิกผม|ดึงผม|ทำร้าย(?!จิตใจ|ความรู้สึก|ใจ)|ใช้กำลัง(?!ใจ)|ลงไม้ลงมือ)";
// ซ้อม is not sport/music practice (แข่ง/บอล/ดนตรี/เต้น/ร้อง). Bounded; no ReDoS.
const ZOM =
  "(?<!(?:แข่ง|บอล|ดนตรี|เต้น)[\\s\\S]{0,24})ซ้อม(?!(?:ร้อง(?!ไห้)|[\\s\\S]{0,32}?(?:แข่ง|บอล|ดนตรี|เต้น|ร้องเพลง)))";
const ZOM_HARM = "(?:จนเจ็บ|จนช้ำ|จนตัวเขียว|ตัวเขียว|ทุบ|ทำร้าย)";
// Who does it (partner, family, carer, generic "he/they"). "พี่" is left out: Jane calls herself พี่.
// Thai word-boundary: แม่/พ่อ are not the prefix of แม่ค้า/พ่อค้า; เขา is not the tail of ภูเขา.
const AGENT = "(แฟน|ผัว|สามี|เมีย|ภรรยา|พ่อเลี้ยง|แม่เลี้ยง|พ่อ(?!ค้า)|แม่(?!ค้า|น้ำ|บ้าน|แรง|แบบ|พิมพ์)|พี่ชาย|ลุง|ครู|(?<!ภู)เขา|ผู้ชาย|คนที่บ้าน|คนในบ้าน)";
// Up to 12 code units between subject and verb ("ผัวเมาแล้วซ้อม", "ผัวไม่พอใจก็ซ้อม").
const GAP = ".{0,12}?";
// ไม่ / ไม่เคย / ไม่ได้ only when they sit directly before the harm verb (not ไม่พอใจ).
const NOT_NEGATED = "(?<!ไม่)(?<!ไม่เคย)(?<!ไม่ได้)";
// Victim marker; ถูก excludes "correct/cheap/like" senses.
const VICTIM = "(โดน|ถูก(?!ต้อง|ใจ|กว่า|ที่|ไหม|มั้ย|และ|ๆ|ด้วย|วิธี|เวลา|สุด|มาก))";
const SEXUAL_TOUCH = "(จับ(หน้าอก|นม|ก้น|ของสงวน|จู๋|หี|จิ๋ม)|ลูบคลำ|ลวนลาม|แทะโลม|คุกคามทางเพศ|แอบถ่าย)";
const CLIP = "(คลิป|รูป|ภาพ)";
const SEX_CLIP = "(โป๊|เปลือย|อนาจาร|แก้ผ้า|เปลือยกาย)";
const ME = "(หนู|ฉัน|เรา)";
const IMAGE_THREAT =
  `(ขู่|ข่มขู่|แบล็กเมล์|แบล็คเมล์).{0,20}?${CLIP}` +
  `|จะ(ปล่อย|ลง)${CLIP}.{0,20}?ถ้าไม่` +
  `|ถ้าไม่.{0,20}?จะ(ปล่อย|ลง)${CLIP}` +
  `|เอาไปประจาน` +
  `|เอา${CLIP}.{0,10}?ไปประจาน` +
  `|${CLIP}${SEX_CLIP}.{0,10}?${ME}` +
  `|${ME}.{0,12}?${CLIP}${SEX_CLIP}` +
  `|(ถ่าย|ปล่อย)${CLIP}.{0,12}?(ตอน)?(อาบน้ำ|มีอะไรกัน|แก้ผ้า|${SEX_CLIP})`;

function uniqueCats(cats: CrisisCategory[]): CrisisCategory[] {
  return [...new Set(cats)];
}

export const EXTRA_CONTEXTUAL: Partial<Record<CrisisCategory, { id: string; re: RegExp }[]>> = {
  violence_danger: [
    { id: "agent_hits", re: new RegExp(`${AGENT}${GAP}${NOT_NEGATED}(?:${HIT_VERBS}|${ZOM}|ข่วน)`) },
    {
      id: "victim_hit",
      re: new RegExp(
        `${VICTIM}${GAP}${NOT_NEGATED}${HIT_VERBS}` +
          `|${VICTIM}${GAP}${AGENT}${GAP}${NOT_NEGATED}${ZOM}` +
          `|${VICTIM}${GAP}${NOT_NEGATED}${ZOM}.{0,16}?${ZOM_HARM}` +
          `|${VICTIM}${GAP}${AGENT}${GAP}${NOT_NEGATED}ข่วน`,
      ),
    },
    { id: "force_words", re: /ใช้กำลัง(?!ใจ)|ลงไม้ลงมือ|ใช้ความรุนแรง|ความรุนแรงในครอบครัว|กระทืบ/ },
    { id: "threat", re: /ข่มขู่|ขู่(จะ|ว่าจะ)?(ทำร้าย|ตี|ตบ|ซ้อม|ฆ่า|เอาชีวิต|ฟัน|แทง|ยิง)/ },
    { id: "harass_generic", re: /คุกคาม(?!ทางเพศ)|สะกดรอย/ },
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
