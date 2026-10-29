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
 * to die (not don't/dont/do not/never + up to 2 words + wanna/want to die),
 * end my life, I was raped / he raped me, self-harm / self harm,
 * cut/cutting myself (not the same clause as shaving/wrapper/razor/nails/
 * by accident), i'm/i am suicidal, I have / i'm having suicidal thoughts,
 * I don't/dont/do not want to live (not "live with"). Thai mixed: อยาก/คิดจะ
 * + die/kms/unalive unless ไม่/ไม่เคย/ไม่คิดจะ/ไม่ได้/ไม่ได้คิดจะ (optional
 * spaces) governs that phrase; รู้สึก/หนู/ผม suicidal unless a ทำให้…ไหม /
 * cause…? / side-effect frame or ไม่ได้รู้สึก; cut ตัวเอง unless the same
 * clause names an accidental cause. Everything else in English goes to the
 * normal card. NFKC + lowercase + Latin fold run before the check
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
  /** Skip this one match only. Other crisis wording in the same message can still fire. */
  skip?: (text: string, match: RegExpMatchArray) => boolean;
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
 * bare suicidal, tenses) is not matched. Precision guards (negation, up to 2
 * intervening English words, side-effect questions, same-clause accidental
 * cut) clear only that phrase — never a separate crisis phrase in the message.
 */

/** ไม่ / ไม่เคย / ไม่คิดจะ / ไม่ได้ / ไม่ได้คิดจะ, optional spaces, immediately before อยาก/คิดจะ. */
const THAI_NEG_PREFIX = /ไม่(?:\s*เคย|\s*ได้(?:\s*คิดจะ)?|\s*คิดจะ)?\s*$/;
const THAI_INTENT_SUFFIX = /(?:อยาก(?:\s*จะ)?|คิดจะ)\s*$/;
const EN_DIE_NEG = /(?:don't|dont|do not|never)(?: +\w+){0,2} +$/;
const ACCIDENTAL_CAUSE = /shaving|\bshave[ds]?\b|โกน|wrapper|ซอง|\brazor\b|มีดโกน|\bnails?\b|เล็บ|by accident|โดนบาด/;

function clauseBounds(text: string, index: number): { start: number; end: number } {
  let start = 0;
  for (const p of ".!?") {
    const i = text.lastIndexOf(p, Math.max(0, index - 1));
    if (i >= start) start = i + 1;
  }
  let end = text.length;
  for (const p of ".!?") {
    const i = text.indexOf(p, index);
    if (i >= 0 && i < end) end = i;
  }
  return { start, end };
}

function skipThaiNegatedIntent(text: string, m: RegExpMatchArray): boolean {
  const before = text.slice(0, m.index ?? 0);
  if (THAI_NEG_PREFIX.test(before)) return true;
  if (THAI_INTENT_SUFFIX.test(before) && THAI_NEG_PREFIX.test(before.replace(THAI_INTENT_SUFFIX, ""))) {
    return true;
  }
  return false;
}

function skipEnglishDieNegation(text: string, m: RegExpMatchArray): boolean {
  return EN_DIE_NEG.test(text.slice(0, m.index ?? 0));
}

function skipSuicidalSideEffect(text: string, m: RegExpMatchArray): boolean {
  const idx = m.index ?? 0;
  const before = text.slice(0, idx);
  const rest = text.slice(idx);
  if (/ไม่ได้\s*$/.test(before) && /^รู้สึก/.test(rest)) return true;
  if (/ไม่ได้\s*รู้สึก\s*$/.test(before)) return true;
  const { start, end } = clauseBounds(text, idx);
  const pre = text.slice(start, idx);
  const post = text.slice(idx, end);
  if (/ทำให้/.test(pre) && /(?:ได้)?ไหม/.test(post)) return true;
  if (/\bcauses?\b/.test(pre) && /\?/.test(post)) return true;
  if (/\bside[ -]?effects?\b/.test(text.slice(start, end))) return true;
  return false;
}

function skipAccidentalCut(text: string, m: RegExpMatchArray): boolean {
  const { start, end } = clauseBounds(text, m.index ?? 0);
  return ACCIDENTAL_CAUSE.test(text.slice(start, end));
}

function ruleHits(rule: ChatCrisisRule, text: string): boolean {
  const flags = rule.re.flags.includes("g") ? rule.re.flags : `${rule.re.flags}g`;
  const re = new RegExp(rule.re.source, flags);
  for (const m of text.matchAll(re)) {
    if (!rule.skip?.(text, m)) return true;
  }
  return false;
}

export const EN_RULES: ChatCrisisRule[] = [
  { id: "EN-T die", cat: "self_harm", lang: "en", re: /(?:คิดจะ|อยากจะ|อยาก)\s?\bdie\b/, skip: skipThaiNegatedIntent },
  { id: "EN-T kms", cat: "self_harm", lang: "en", re: /(?:คิดจะ|อยากจะ|อยาก)\s?\bkms\b/, skip: skipThaiNegatedIntent },
  { id: "EN-T suicidal", cat: "self_harm", lang: "en", re: /(?:รู้สึก|(?:หนู|ฉัน|ผม|เรา|กู))\s*suicidal\b/, skip: skipSuicidalSideEffect },
  { id: "EN-T abuse", cat: "violence_danger", lang: "en", re: /(?:แฟน|พ่อเลี้ยง|แม่เลี้ยง|พ่อ|แม่|พี่ชาย|พี่สาว|พี่|เขา)\s*abuse(?:s|d|ing)?\s*(?:หนู|ฉัน|ผม|เรา)/ },
  { id: "EN-T cut", cat: "self_harm", lang: "en", re: /(?:หนู|ฉัน|ผม|เรา|อยาก(?:จะ)?|คิดจะ)\s?\bcut\s?ตัวเอง|\bcut\s?(?:แขน|ข้อมือ)/, skip: skipAccidentalCut },
  { id: "EN-T unalive", cat: "self_harm", lang: "en", re: /(?:คิดจะ|อยากจะ|อยาก)\s?\bunalive\b|\bunalive\s?ตัวเอง/, skip: skipThaiNegatedIntent },
  { id: "EN kill myself", cat: "self_harm", lang: "en", re: /\bkill(?:ing)? myself\b/ },
  { id: "EN kms", cat: "self_harm", lang: "en", re: /^kms[.!?]*$|\b(?:gonna|going to|will|want to|wanna) kms\b/ },
  { id: "EN commit suicide", cat: "self_harm", lang: "en", re: /\bcommit suicide\b/ },
  { id: "EN want to die", cat: "self_harm", lang: "en", re: /\b(?:wanna|want to) die\b/, skip: skipEnglishDieNegation },
  { id: "EN end my life", cat: "self_harm", lang: "en", re: /\bend my life\b(?! insurance)/ },
  { id: "EN raped", cat: "sexual_violence", lang: "en", re: /\bi was raped\b|\bhe raped me\b/ },
  { id: "EN self-harm", cat: "self_harm", lang: "en", re: /\bself-harm\b|\bself harm\b/ },
  { id: "EN cut myself", cat: "self_harm", lang: "en", re: /\bcut(?:ting)? myself\b/, skip: skipAccidentalCut },
  { id: "EN i'm suicidal", cat: "self_harm", lang: "en", re: /\bi(?:'m| am) suicidal\b|\bi(?:'m| am) having suicidal thoughts\b|\bi have suicidal thoughts\b/, skip: skipSuicidalSideEffect },
  { id: "EN don't want to live", cat: "self_harm", lang: "en", re: /\bi (?:don't|dont|do not) want to live(?: anymore)?(?! with)\b/ },
];

export const TH_F_ID = "TH-F bare follow-up after violence cue";

const prepTh = (t: string) => compact(prepCheckText(t));
const prepEn = (t: string) => normalize(prepCheckText(t)).replace(/[\u2018\u2019]/g, "'");

export function detectChatCrisis(text: string): ChatCrisisHit {
  const th = prepTh(text);
  const en = prepEn(text);
  const hits = [...TH_RULES.filter((r) => ruleHits(r, th)), ...EN_RULES.filter((r) => ruleHits(r, en))];
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
