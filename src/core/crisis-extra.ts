import type { CrisisCategory, CrisisResult } from "./types";
import { CRISIS_RULES, detectCrisis, MILD_MARKERS, TOPIC_MARKERS } from "./crisis";
import { compact, findPhrases } from "./text";

/**
 * Extra crisis rules (outside pinned crisis.ts). Round 3 (final, narrow).
 * Four high-precision shapes only:
 *
 * (a) Threats to leak, post, or spread images/clips with any ถ้า-condition
 *     (ถ้า…จะปล่อย/ประจาน, not only ถ้าไม่), filming sex, and blackmail
 *     with a photo or clip. ลง is only a leak with คลิป or nude media
 *     (ถ้าว่างจะลงรูปเที่ยว is not). Bare จะปล่อยคลิปสอนแต่งหน้า is not.
 *
 * (b) Coercion to send nudes: บังคับ/ขู่ให้ส่งรูปโป๊/รูปเปลือย/คลิป.
 *
 * (c) Passive โดน/ถูก + ซ้อม/ตี (including รุม and an optional person),
 *     excluding sport or performance on ซ้อม (วิ่ง, กีตาร์, รำ, พูด,
 *     ก่อนแข่ง, …). ตี is not ตีน, ตี๋, ตีตัว…ห่าง, or ตีกลับ.
 *
 * (d) A named partner, family member, friend, teacher, or similar agent
 *     (แฟน, ผัว, สามี, พ่อ, แม่, เพื่อน, …) hitting or beating 'me'
 *     (หนู, ฉัน, เรา, ผม, …). ไม่ / ไม่เคย / ไม่ได้ negate only on the verb.
 *
 * Dropped: bare person + ตี/เตะ/ซ้อม/ข่วน with no victim; generic force,
 * threat, harass, covert photo, and non-partner touch. Those stay with
 * pinned detectCrisis. Matched on compact text. Contextual: topic → banner;
 * mild qualifier banners violence. Rules only — no model.
 */

// Who does it (partner, family, friend, carer). "พี่" is left out: Jane calls herself พี่.
// Thai word-boundary: แม่/พ่อ are not the prefix of แม่ค้า/พ่อค้า; เขา is not the tail of ภูเขา.
const AGENT = "(แฟน|ผัว|สามี|เมีย|ภรรยา|พ่อเลี้ยง|แม่เลี้ยง|พ่อ(?!ค้า)|แม่(?!ค้า|น้ำ|บ้าน|แรง|แบบ|พิมพ์)|พี่ชาย|พี่สาว|ลุง|ป้า|น้า|อา|ยาย|ย่า|ตา|ปู่|ครู|เพื่อน|(?<!ภู)เขา|ผู้ชาย|คนที่บ้าน|คนในบ้าน)";
// Up to 12 code units between subject and verb ("ผัวไม่พอใจก็ซ้อมหนู").
const GAP = ".{0,12}?";
// ไม่ / ไม่เคย / ไม่ได้ only when they sit directly before the harm verb (not ไม่พอใจ).
const NOT_NEGATED = "(?<!ไม่)(?<!ไม่เคย)(?<!ไม่ได้)";
// Victim marker; ถูก excludes "correct/cheap/like" senses.
const VICTIM = "(โดน|ถูก(?!ต้อง|ใจ|กว่า|ที่|ไหม|มั้ย|และ|ๆ|ด้วย|วิธี|เวลา|สุด|มาก))";
const ME = "(หนู|ฉัน|เรา|ผม|ดิฉัน|ชั้น)";
const CLIP = "(คลิป|รูป|ภาพ)";
const SEX_CLIP = "(โป๊|เปลือย|อนาจาร)";
// ซ้อม is not sport/music/performance practice sitting on the verb. Bounded; no ReDoS.
const ZOM_SPORT = "(?:ร้อง(?!ไห้)|บอล|ดนตรี|เต้น|แข่ง|วิ่ง|กีตาร์|รำ|พูด|ว่ายน้ำ|โยคะ|เปียโน|บาส|วอลเลย์|ขับ|แบด|เชียร์|อ่าน|ฟุตซอล|สูตร|.{0,12}?ก่อนแข่ง)";
const ZOM = `ซ้อม(?!${ZOM_SPORT})`;
// ตี is not the foot-word ตีน, a tone-marked ตี๋, ตีตัว…ห่าง, or ตีกลับ.
const TEE = "ตี(?![่้๊๋]|น(?![่้๊๋])|กลับ|ตัว.{0,6}?ห่าง)";
const IMAGE_THREAT =
  `(ขู่|ข่มขู่|แบล็กเมล์|แบล็คเมล์).{0,24}?${CLIP}` +
  `|ถ้า.{0,24}?จะ(ปล่อย|ประจาน)${CLIP}` +
  `|จะ(ปล่อย|ประจาน)${CLIP}.{0,24}?ถ้า` +
  `|ถ้า.{0,24}?จะลง(คลิป|(รูป|ภาพ)${SEX_CLIP})` +
  `|เอา${CLIP}.{0,10}?ไปประจาน` +
  `|(ถ่าย|ปล่อย)${CLIP}.{0,12}?(ตอน)?(อาบน้ำ|มีอะไรกัน|แก้ผ้า|${SEX_CLIP})` +
  `|โดน(แบล็กเมล์|แบล็คเมล์).{0,12}?(ด้วย)?${CLIP}`;
const COERCE_NUDES = `(บังคับ|ขู่)ให้ส่ง((รูป|ภาพ)${SEX_CLIP}|คลิป${SEX_CLIP}?)`;

function uniqueCats(cats: CrisisCategory[]): CrisisCategory[] {
  return [...new Set(cats)];
}

export const EXTRA_CONTEXTUAL: Partial<Record<CrisisCategory, { id: string; re: RegExp }[]>> = {
  violence_danger: [
    {
      id: "victim_hit",
      re: new RegExp(
        `${VICTIM}${GAP}${NOT_NEGATED}(?:รุม)?(?:${AGENT}${GAP})?(?:รุม)?(?:${ZOM}|${TEE})`,
      ),
    },
    {
      id: "partner_hits_me",
      re: new RegExp(`${AGENT}${GAP}${NOT_NEGATED}(?:${ZOM}|${TEE})${ME}`),
    },
  ],
  sexual_violence: [
    { id: "image_threat", re: new RegExp(IMAGE_THREAT) },
    { id: "coerce_nudes", re: new RegExp(COERCE_NUDES) },
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
