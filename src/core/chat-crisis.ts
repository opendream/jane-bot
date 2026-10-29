/**
 * Pre-model crisis check (chat-first and card-first). Additive to pinned
 * detectCrisis(); never edits crisis.ts. Jane is Thai-only for now: Thai
 * named rules stay as-is; English is a short list of exact phrases on
 * folded lowercase text (plus mixed Thai wording + an English token).
 *
 * Fullwidth / accented Latin is folded to ASCII (Thai unchanged, including
 * SARA AM). Thai matches run on compact() (NFC, zero-width stripped, spaces
 * removed). English uses lowercased normalize() with curly quotes folded.
 * Mixed Thai-English true positives use Thai wording immediately before the
 * token: อยาก/คิดจะ die|kms|unalive (not ไม่อยาก), รู้สึก suicidal,
 * cut ตัวเอง/แขน/ข้อมือ, (แฟน|พ่อ|แม่|…) abuse (หนู|ฉัน|…). Exact English
 * phrases: kill/killing myself, kms as a bare line or after gonna/going to/
 * will/want to/wanna (never a distance "N kms"), commit suicide, wanna/want
 * to die (not don't/dont/do not wanna die),
 * end my life, I was raped / he raped me, self-harm / self harm,
 * cut/cutting myself, i'm/i am suicidal. Everything else in English goes
 * to the normal card. NFKC + lowercase + Latin fold run before the check
 * (prepCheckText), including English-only lines.
 *
 * The in-memory reason tag is "chat-crisis" (distinct from "rules-crisis"). It
 * stores rule ids only — never user text — and is compiled out of production.
 */
import type { CrisisCategory } from "./types";
import { compact, normalize, prepCheckText } from "./text";

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
  { id: "TH-G suicide transliteration", cat: "self_harm", lang: "th", re: /ซ(ุย|ูอิ?|ู)ไซด์/ },
];

/**
 * Mixed Thai wording + English token, and a short exact English phrase list.
 * Jane is Thai-only: fuzzy English (bare die/cut/abuse, forced/forcing,
 * suicidal thoughts, bare suicidal, tenses) is not matched. อยาก die does
 * not fire on ไม่อยาก die.
 */
export const EN_RULES: ChatCrisisRule[] = [
  { id: "EN-T die", cat: "self_harm", lang: "en", re: /(?:คิดจะ|(?<!ไม่(?:ได้)?)อยากจะ|(?<!ไม่(?:ได้)?)อยาก)\s?\bdie\b/ },
  { id: "EN-T kms", cat: "self_harm", lang: "en", re: /(?:คิดจะ|(?<!ไม่(?:ได้)?)อยากจะ|(?<!ไม่(?:ได้)?)อยาก)\s?\bkms\b/ },
  { id: "EN-T suicidal", cat: "self_harm", lang: "en", re: /รู้สึก\s?suicidal\b/ },
  { id: "EN-T abuse", cat: "violence_danger", lang: "en", re: /(?:แฟน|พ่อเลี้ยง|แม่เลี้ยง|พ่อ|แม่|พี่ชาย|พี่สาว|พี่|เขา)\s*abuse(?:s|d|ing)?\s*(?:หนู|ฉัน|ผม|เรา)/ },
  { id: "EN-T cut", cat: "self_harm", lang: "en", re: /(?:หนู|ฉัน|ผม|เรา|อยาก(?:จะ)?|คิดจะ)\s?\bcut\s?ตัวเอง|\bcut\s?(?:แขน|ข้อมือ)/ },
  { id: "EN-T unalive", cat: "self_harm", lang: "en", re: /(?:คิดจะ|(?<!ไม่(?:ได้)?)อยากจะ|(?<!ไม่(?:ได้)?)อยาก)\s?\bunalive\b|\bunalive\s?ตัวเอง/ },
  { id: "EN kill myself", cat: "self_harm", lang: "en", re: /\bkill(?:ing)? myself\b/ },
  { id: "EN kms", cat: "self_harm", lang: "en", re: /^kms[.!?]*$|\b(?:gonna|going to|will|want to|wanna) kms\b/ },
  { id: "EN commit suicide", cat: "self_harm", lang: "en", re: /\bcommit suicide\b/ },
  { id: "EN want to die", cat: "self_harm", lang: "en", re: /(?<!\b(?:don't|dont|do not) )\b(?:wanna|want to) die\b/ },
  { id: "EN end my life", cat: "self_harm", lang: "en", re: /\bend my life\b(?! insurance)/ },
  { id: "EN raped", cat: "sexual_violence", lang: "en", re: /\bi was raped\b|\bhe raped me\b/ },
  { id: "EN self-harm", cat: "self_harm", lang: "en", re: /\bself-harm\b|\bself harm\b/ },
  { id: "EN cut myself", cat: "self_harm", lang: "en", re: /\bcut(?:ting)? myself\b/ },
  { id: "EN i'm suicidal", cat: "self_harm", lang: "en", re: /\bi(?:'m| am) suicidal\b/ },
];

export const TH_F_ID = "TH-F bare follow-up after violence cue";

const prepTh = (t: string) => compact(prepCheckText(t));
const prepEn = (t: string) => normalize(prepCheckText(t)).replace(/[\u2018\u2019]/g, "'");

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
  isBareFollowup(cur) && prev.some((p) => VIOLENCE_CUE.test(prepTh(p)) || VIOLENCE_CUE.test(prepEn(p)));

function joinedWindow(input: string, prev: string[]): string {
  return prev.length ? [...prev, input].join(" ") : input;
}

/**
 * Current line, then current + previous user lines (same window as the pinned
 * check; unanswered chat-first lines are all included), then the context-armed
 * bare follow-up. The cue line alone never fires.
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
