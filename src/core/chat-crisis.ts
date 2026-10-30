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
 * token: อยาก/คิดจะ die|kms|unalive (not ไม่อยาก as a separate sense — option 1
 * still treats the crisis word as CLEAR), รู้สึก suicidal, cut ตัวเอง/แขน/ข้อมือ,
 * (แฟน|พ่อ|แม่|…) abuse (หนู|ฉัน|…). Exact English phrases: kill/killing myself,
 * kms as a bare line or after gonna/going to/will/want to/wanna (never a
 * distance "N kms"), commit suicide, wanna/want to die, end my life,
 * I was raped / he raped me, self-harm / self harm, cut/cutting myself,
 * i'm/i am suicidal, I have / i'm having suicidal thoughts,
 * I don't/dont/do not want to live (not "live with").
 *
 * Option 1 (Keng, 30 Oct 2026): any crisis-word match is CLEAR. There are no
 * precision downgrades. Negation, side-effect questions, and accidental-cut
 * frames that still contain a crisis word stay CLEAR (false alarms accepted).
 * AMBIGUOUS is only vague distress with no crisis word (weak cues).
 * Help-seeking tails never weaken a disclosure. The multi-turn window may
 * only escalate to CLEAR. Everything else in English goes to the normal card.
 * NFKC + lowercase + Latin fold run before the check (prepCheckText),
 * including English-only lines.
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
  /**
   * Weak-cue rule: a match is AMBIGUOUS (never NONE, never CLEAR by itself).
   * A crisis-word rule in the same message still wins as CLEAR.
   */
  ambiguous?: boolean;
}

export type ChatCrisisOutcome = "clear" | "ambiguous" | "none";

export interface ChatCrisisHit {
  /** True only for CLEAR. AMBIGUOUS never opens the crisis screen by itself. */
  crisis: boolean;
  outcome: ChatCrisisOutcome;
  categories: CrisisCategory[];
  rules: string[];
}

/**
 * DRAFT. Keng review Sat 31 Oct 2026 before this is treated as product copy.
 * Shown on every AMBIGUOUS turn with a button that opens the existing crisis screen.
 * Chat-first talks first (same guarded path as NONE); this line is fixed UI, not generated.
 */
export const AMBIGUOUS_CRISIS_LINE_TH = "ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะ";
export const AMBIGUOUS_CRISIS_LINE_STATUS = "draft" as const;

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
 * bare suicidal, tenses) is not matched. Option 1: a crisis-word match is
 * always CLEAR. No precision downgrades.
 */

export const EN_RULES: ChatCrisisRule[] = [
  { id: "EN-T die", cat: "self_harm", lang: "en", re: /(?:คิดจะ|อยากจะ|อยาก)\s?\bdie\b/ },
  { id: "EN-T kms", cat: "self_harm", lang: "en", re: /(?:คิดจะ|อยากจะ|อยาก)\s?\bkms\b/ },
  { id: "EN-T suicidal", cat: "self_harm", lang: "en", re: /(?:รู้สึก|(?:หนู|ฉัน|ผม|เรา|กู))\s*suicidal\b/ },
  { id: "EN-T abuse", cat: "violence_danger", lang: "en", re: /(?:แฟน|พ่อเลี้ยง|แม่เลี้ยง|พ่อ|แม่|พี่ชาย|พี่สาว|พี่|เขา)\s*abuse(?:s|d|ing)?\s*(?:หนู|ฉัน|ผม|เรา)/ },
  { id: "EN-T cut", cat: "self_harm", lang: "en", re: /(?:หนู|ฉัน|ผม|เรา|อยาก(?:จะ)?|คิดจะ)\s?\bcut\s?ตัวเอง|\bcut\s?(?:แขน|ข้อมือ)/ },
  { id: "EN-T unalive", cat: "self_harm", lang: "en", re: /(?:คิดจะ|อยากจะ|อยาก)\s?\bunalive\b|\bunalive\s?ตัวเอง/ },
  { id: "EN kill myself", cat: "self_harm", lang: "en", re: /\bkill(?:ing)? myself\b/ },
  { id: "EN kms", cat: "self_harm", lang: "en", re: /^kms[.!?]*$|\b(?:gonna|going to|will|want to|wanna) kms\b/ },
  { id: "EN commit suicide", cat: "self_harm", lang: "en", re: /\bcommit suicide\b/ },
  { id: "EN want to die", cat: "self_harm", lang: "en", re: /\b(?:wanna|want to) die\b/ },
  { id: "EN end my life", cat: "self_harm", lang: "en", re: /\bend my life\b(?! insurance)/ },
  { id: "EN raped", cat: "sexual_violence", lang: "en", re: /\bi was raped\b|\bhe raped me\b/ },
  { id: "EN self-harm", cat: "self_harm", lang: "en", re: /\bself-harm\b|\bself harm\b/ },
  { id: "EN cut myself", cat: "self_harm", lang: "en", re: /\bcut(?:ting)? myself\b/ },
  { id: "EN i'm suicidal", cat: "self_harm", lang: "en", re: /\bi(?:'m| am) suicidal\b|\bi(?:'m| am) having suicidal thoughts\b|\bi have suicidal thoughts\b/ },
  { id: "EN don't want to live", cat: "self_harm", lang: "en", re: /\bi (?:don't|dont|do not) want to live(?: anymore)?(?! with)\b/ },
];

/**
 * Vague distress with no crisis word. A match is AMBIGUOUS. Closed list: must
 * not fire on the 12 NONE eval tables (1839). Everyday SRH "กังวล"/"เครียด"
 * stays NONE.
 */
export const WEAK_TH_RULES: ChatCrisisRule[] = [
  { id: "TH-W hopeless", cat: "self_harm", lang: "th", re: /สิ้นหวัง|หมดหวัง|ท้อแท้/, ambiguous: true },
  { id: "TH-W no way forward", cat: "self_harm", lang: "th", re: /ไม่รู้จะไปต่อ|ไม่เห็นทางออก/, ambiguous: true },
  { id: "TH-W want to disappear", cat: "self_harm", lang: "th", re: /อยากหายไป/, ambiguous: true },
  { id: "TH-W exhausted of living", cat: "self_harm", lang: "th", re: /หมดแรง(?:ที่)?จะอยู่/, ambiguous: true },
];

export const WEAK_EN_RULES: ChatCrisisRule[] = [
  { id: "EN-W hopeless", cat: "self_harm", lang: "en", re: /\bhopeless\b/, ambiguous: true },
  { id: "EN-W empty", cat: "self_harm", lang: "en", re: /\bi feel empty\b/, ambiguous: true },
  { id: "EN-W no way forward", cat: "self_harm", lang: "en", re: /\bdon'?t see a way forward\b|\bno way out\b/, ambiguous: true },
];

export const TH_F_ID = "TH-F bare follow-up after violence cue";

const prepTh = (t: string) => compact(prepCheckText(t));
const prepEn = (t: string) => normalize(prepCheckText(t)).replace(/[\u2018\u2019]/g, "'");

function classifyRule(rule: ChatCrisisRule, text: string): ChatCrisisOutcome {
  const flags = rule.re.flags.includes("g") ? rule.re.flags : `${rule.re.flags}g`;
  const re = new RegExp(rule.re.source, flags);
  if (![...text.matchAll(re)].length) return "none";
  return rule.ambiguous ? "ambiguous" : "clear";
}

function makeHit(outcome: ChatCrisisOutcome, rules: ChatCrisisRule[]): ChatCrisisHit {
  if (outcome === "none" || rules.length === 0) {
    return { crisis: false, outcome: "none", categories: [], rules: [] };
  }
  return {
    crisis: outcome === "clear",
    outcome,
    categories: [...new Set(rules.map((r) => r.cat))],
    rules: rules.map((r) => r.id),
  };
}

export function detectChatCrisis(text: string): ChatCrisisHit {
  const th = prepTh(text);
  const en = prepEn(text);
  const clear: ChatCrisisRule[] = [];
  const ambiguous: ChatCrisisRule[] = [];
  for (const r of TH_RULES) {
    const o = classifyRule(r, th);
    if (o === "clear") clear.push(r);
    else if (o === "ambiguous") ambiguous.push(r);
  }
  for (const r of EN_RULES) {
    const o = classifyRule(r, en);
    if (o === "clear") clear.push(r);
    else if (o === "ambiguous") ambiguous.push(r);
  }
  for (const r of WEAK_TH_RULES) {
    const o = classifyRule(r, th);
    if (o === "clear") clear.push(r);
    else if (o === "ambiguous") ambiguous.push(r);
  }
  for (const r of WEAK_EN_RULES) {
    const o = classifyRule(r, en);
    if (o === "clear") clear.push(r);
    else if (o === "ambiguous") ambiguous.push(r);
  }
  if (clear.length) return makeHit("clear", clear);
  if (ambiguous.length) return makeHit("ambiguous", ambiguous);
  return makeHit("none", []);
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
 * The window may only escalate to CLEAR; AMBIGUOUS is never inherited from prev.
 */
export function detectChatCrisisForTurn(input: string, prev: string[]): ChatCrisisHit {
  const cur = detectChatCrisis(input);
  if (cur.outcome === "clear") return cur;
  if (prev.length) {
    const joined = detectChatCrisis(joinedWindow(input, prev));
    // The window may only escalate to CLEAR. AMBIGUOUS is current-turn only.
    if (joined.outcome === "clear") return joined;
  }
  if (bareFollowupInContext(input, prev)) {
    return { crisis: true, outcome: "clear", categories: ["violence_danger"], rules: [TH_F_ID] };
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
