/**
 * Pre-model crisis check (chat-first and card-first). Additive to pinned
 * detectCrisis(); never edits crisis.ts. Thai matches run on compact() (NFC, zero-width stripped, spaces removed)
 * because users space Thai unpredictably. English uses lowercased normalize() with
 * curly quotes folded. Named regexes (not word lists) so bystander / definition
 * questions do not fire. Whole-token English crisis words also match inside
 * mixed Thai lines; word boundaries keep HIV / PrEP / condom from firing.
 *
 * The in-memory reason tag is "chat-crisis" (distinct from "rules-crisis"). It
 * stores rule ids only — never user text — and is compiled out of production.
 */
import type { CrisisCategory } from "./types";
import { compact, normalize } from "./text";

export interface ChatCrisisRule {
  id: string;
  cat: CrisisCategory;
  lang: "th" | "en";
  re: RegExp;
}

export interface ChatCrisisHit {
  crisis: boolean;
  categories: CrisisCategory[];
  rules: string[];
}

const ME_TH = "(เรา|หนู|ฉัน|ผม|กู|ตัวเอง)";
const REL_TH = "(แฟน|ผัว|สามี|เมีย|ภรรยา|พ่อเลี้ยง|แม่เลี้ยง|พ่อ|แม่|พี่ชาย|พี่สาว|ลุง|น้า|อา)";
/** Non-violent senses of ตี (idioms, times of day, sports, print). Used by the context cue. */
const TI_IDIOM =
  "ความ|สนิท|สอง|หนึ่ง|สาม|สี่|ห้า|หก|บอล|กลอง|ราคา|แผ่|ตัว|พิมพ์|กัน|กิน|ระฆัง|เหล็ก|ไข่|ปิง|เทนนิส|แบด|ลังกา|อก|มึน|โพย|ซี้";
const ZOOM_PRACTICE = "หนัก|เต้น|ดนตรี|บอล|มวย";

/** Thai rules run on compact() (all whitespace removed). */
export const TH_RULES: ChatCrisisRule[] = [
  { id: "TH-A1 first-person harassed", cat: "sexual_violence", lang: "th", re: new RegExp(`${ME_TH}(ที่)?(ถูก|โดน)(ใคร|เขา|คน)?(ทาง)?(เพศ)?คุกคาม`) },
  { id: "TH-A2 my harassment", cat: "sexual_violence", lang: "th", re: new RegExp(`การ(ถูก|โดน)?คุกคาม(ทางเพศ)?ของ${ME_TH}`) },
  { id: "TH-A3 telling about harassment", cat: "sexual_violence", lang: "th", re: /(เล่า|บอก)เรื่อง(การ|ที่)?(ถูก|โดน)?คุกคาม(ทางเพศ)?ให้/ },
  { id: "TH-B unwanted touch", cat: "sexual_violence", lang: "th", re: /(แตะ|จับ|ลูบ|คลำ)(เนื้อ)?ตัว.{0,20}(ไม่ชอบ|ไม่ยอม|ไม่เต็มใจ|ไม่โอเค)/ },
  { id: "TH-C1 self-blame for event", cat: "sexual_violence", lang: "th", re: /โทษตัวเอง(กับ|เรื่อง|ที่|ใน)?(สิ่ง|เรื่อง)ที่เกิด/ },
  { id: "TH-C2 guilt not telling", cat: "sexual_violence", lang: "th", re: /รู้สึกผิดที่ไม่(ได้)?(พูด|บอก|เล่า)เรื่องนี้/ },
  { id: "TH-C3 victim blamed", cat: "sexual_violence", lang: "th", re: new RegExp(`โทษ${ME_TH}ที่(ถูก|โดน)`) },
  { id: "TH-D fear from behaviour", cat: "violence_danger", lang: "th", re: /กลัว(ไป|เจอ|กลับ|เข้า).{0,20}เพราะ(พฤติกรรม|การกระทำ)ของ/ },
  // ตี is omitted on purpose: short "โดนแฟนตี" stays on relationship.violence.001.
  { id: "TH-E1 relation + violent verb", cat: "violence_danger", lang: "th", re: new RegExp(`${REL_TH}(ชอบ|มัก|เคย)?(ซ้อม(?!${ZOOM_PRACTICE})|ข่วน|ใช้กำลัง)`) },
  { id: "TH-E2 victim + beaten/forced", cat: "violence_danger", lang: "th", re: new RegExp(`(ถูก|โดน)(แฟน|ผัว|สามี|เมีย|พ่อ|แม่|เขา)?(ซ้อม(?!${ZOOM_PRACTICE})|ใช้กำลัง|ข่วน)`) },
];

/** English rules run on lowercased normalize() with curly quotes folded. */
export const EN_RULES: ChatCrisisRule[] = [
  { id: "EN-A1 not believed/dismissed about harassment", cat: "sexual_violence", lang: "en", re: /\b(believe|believes|believing) me about (the )?(sexual )?harass/ },
  { id: "EN-A2 my concerns about harassment", cat: "sexual_violence", lang: "en", re: /\bmy concerns? about (the )?(sexual )?harass/ },
  { id: "EN-A3 harassment I experienced / I was harassed", cat: "sexual_violence", lang: "en", re: /\bharassment (that )?i (experienced|went through|faced|suffered)|\bi('m| am| was| have been|'ve been| got| keep getting) (being )?(sexually )?harassed/ },
  { id: "EN-A4 scared to tell about harassment", cat: "sexual_violence", lang: "en", re: /\b(scared|afraid|frightened|nervous) (to|of) tell(ing)? (someone|anyone|somebody|my \w+|people) about (the |my )?(sexual )?harass/ },
  { id: "EN-B unwanted touch", cat: "sexual_violence", lang: "en", re: /\btouch(es|ed|ing)? me\b.{0,30}\b(don't|do not|didn't|did not) (like|want)|\btouch(es|ed|ing)? me (inappropriately|without)/ },
  { id: "EN-C1 self-blame for event", cat: "sexual_violence", lang: "en", re: /\bblam(e|ing) myself for (what happened|it happening)/ },
  { id: "EN-C2 guilt about not speaking up", cat: "sexual_violence", lang: "en", re: /\bguilty (about|for) not (speaking up|telling)/ },
  { id: "EN-D fear from behaviour", cat: "violence_danger", lang: "en", re: /\b(scared|afraid|frightened) to (go|be|walk|return)\b.{0,40}\bbecause of (someone|somebody|him|her|them|a person|this person)('s)? (behaviou?r|actions)/ },
  { id: "EN-E partner/family hits me", cat: "violence_danger", lang: "en", re: /\b(my )?(boyfriend|girlfriend|husband|wife|partner|bf|gf|dad|father|stepdad|mum|mom|mother|brother|sister) (beats|hits|hit|scratches|slaps|uses force on) me\b(?! up)|\bi (got|get|was|am being|keep getting) beaten\b/ },
  { id: "EN-F forced sex", cat: "sexual_violence", lang: "en", re: /\bi (was|got|have been|'ve been) forced (to have|into) (sex|sexual (intercourse|activity))\b|\bsomeone forced me (to have|into) (sex|sexual)/ },
  { id: "EN-G don't want to live", cat: "self_harm", lang: "en", re: /\bi (don't|do not) want to live(?: anymore| any more)?(?=$|[.!?,])|\bi (?:feel like i )?(can't|cannot|can not) go on living\b/ },
  { id: "EN-H cutting myself", cat: "self_harm", lang: "en", re: /\bcutting myself\b/ },
  { id: "EN-I end my life", cat: "self_harm", lang: "en", re: /\bend my life\b(?! insurance)/ },
  { id: "EN-J bare forced sex", cat: "sexual_violence", lang: "en", re: /^forced sex[.!?]*$/ },
  // Whole-token English crisis words. Also match inside mixed Thai lines
  // (word boundaries keep HIV / PrEP / condom from firing).
  { id: "EN-T die", cat: "self_harm", lang: "en", re: /\bdie\b/ },
  { id: "EN-T kms", cat: "self_harm", lang: "en", re: /\bkms\b/ },
  { id: "EN-T suicidal", cat: "self_harm", lang: "en", re: /\bsuicidal\b/ },
  { id: "EN-T abuse", cat: "violence_danger", lang: "en", re: /\babuse\b/ },
  { id: "EN-T cut", cat: "self_harm", lang: "en", re: /\bcut\b/ },
  { id: "EN-T unalive", cat: "self_harm", lang: "en", re: /\bunalive\b/ },
];

export const TH_F_ID = "TH-F bare follow-up after violence cue";

const prepTh = (t: string) => compact(t);
const prepEn = (t: string) => normalize(t).replace(/[\u2018\u2019]/g, "'");

export function detectChatCrisis(text: string): ChatCrisisHit {
  const th = prepTh(text);
  const en = prepEn(text);
  const hits = [...TH_RULES.filter((r) => r.re.test(th)), ...EN_RULES.filter((r) => r.re.test(en))];
  return {
    crisis: hits.length > 0,
    categories: [...new Set(hits.map((h) => h.cat))],
    rules: hits.map((h) => h.id),
  };
}

const FOLLOWUP_ONLY = /^(แล้ว)?(จะ)?(ต้อง)?(ทำ(ไง|ยังไง|อย่างไร)ดี|ควรทำ(ไง|ยังไง|อย่างไร))[?？]*$/;
export const isBareFollowup = (t: string) => FOLLOWUP_ONLY.test(prepTh(t));

/** Cue only arms TH-F; it never fires on its own. ตี idioms are excluded. */
const VIOLENCE_CUE = new RegExp(
  `(ทำร้าย|ตบ|ตี(?!${TI_IDIOM})|ต่อย|ซ้อม(?!${ZOOM_PRACTICE})|คุกคาม|ลวนลาม|ข่มขืน|ใช้กำลัง|ขู่|\\bhit\\b|\\bbeat|\\bhurt|\\bharass)`,
);

export const bareFollowupInContext = (cur: string, prev: string[]): boolean =>
  isBareFollowup(cur) && prev.slice(-2).some((p) => VIOLENCE_CUE.test(prepTh(p)) || VIOLENCE_CUE.test(prepEn(p)));

function joinedWindow(input: string, prev: string[]): string {
  return prev.length ? [...prev.slice(-2), input].join(" ") : input;
}

/**
 * Current line, then current + previous 1–2 user lines (same window as the pinned
 * check), then the context-armed bare follow-up. The cue line alone never fires.
 */
export function detectChatCrisisForTurn(input: string, prev: string[]): ChatCrisisHit {
  const cur = detectChatCrisis(input);
  if (cur.crisis) return cur;
  if (prev.length) {
    const joined = detectChatCrisis(joinedWindow(input, prev));
    if (joined.crisis) return joined;
  }
  if (bareFollowupInContext(input, prev)) {
    return { crisis: true, categories: ["violence_danger"], rules: [TH_F_ID] };
  }
  return cur;
}

function loggingOn(): boolean {
  return import.meta.env.DEV === true || import.meta.env.MODE === "test" || import.meta.env.VITE_EVAL === "1";
}

export type ChatCrisisReason = "chat-crisis";

let lastReason: ChatCrisisReason | null = null;
let lastRules: readonly string[] = [];

/** Dev/eval only. Rule ids, never user text. Production builds skip the write. */
export function noteChatCrisisHit(rules: readonly string[]): void {
  if (!loggingOn()) return;
  lastReason = "chat-crisis";
  lastRules = rules;
}

/** Dev/eval only. `null` in production builds. Never includes user text. */
export function chatCrisisLog(): { reason: ChatCrisisReason; rules: readonly string[] } | null {
  if (!loggingOn() || !lastReason) return null;
  return { reason: lastReason, rules: lastRules };
}

export function resetChatCrisisLog(): void {
  lastReason = null;
  lastRules = [];
}
