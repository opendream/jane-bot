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
 * cut/cutting myself (CLEAR unless the same clause is an explicit accidental
 * construction: accidentally cut / cut myself shaving / by accident; a bare
 * tool noun is never a cue; repetition ทุกคืน/every night stays CLEAR),
 * i'm/i am suicidal, I have / i'm having suicidal thoughts, I don't/dont/do
 * not want to live (not "live with"; "in fear" / "together" is AMBIGUOUS).
 * Thai mixed: อยาก/คิดจะ + die/kms/unalive unless a NARROW predicate-start
 * negation (ไม่/ไม่ค่อย/ไม่เคย/ไม่คิดจะ/ไม่ได้ at clause start or right after
 * หนู/เรา/ฉัน/ผม/กู/ดิฉัน/เค้า, optional ก็) immediately precedes อยาก/รู้สึก/คิด
 * + the crisis term. A ไม่ได้ that follows any other Thai word is never
 * negation. รู้สึก/หนู/ผม suicidal unless the CAUSE is a closed-list medication
 * or medical product AND the question is about that feeling as an effect
 * (ผลข้างเคียง/side effect, '<drug> ทำให้รู้สึก X ได้ไหม', or กิน/ใช้/ฉีด <drug>
 * แล้วรู้สึก X + clause-final question). A person or place as cause stays CLEAR.
 * cut ตัวเอง / ข้อมือ / แขน with the speaker as subject, or any repetition
 * marker (ทุกคืน/ทุกวัน/บ่อย/อีกแล้ว/every night), is CLEAR whatever tool is
 * named. Downgrade only for an explicit accidental construction (โดน X บาด,
 * เผลอทำ X บาด, บาดตอนโกน/ตอนทำกับข้าว, accidentally cut / cut myself shaving).
 * A bare tool noun is never a cue. Guards only downgrade CLEAR → AMBIGUOUS,
 * never to NONE, and only on a narrow positive match of the whole construction.
 * Everything else stays CLEAR. Help-seeking tails never weaken a disclosure.
 * The multi-turn window may only escalate to CLEAR. Everything else in English
 * goes to the normal card. NFKC + lowercase + Latin fold run before the check
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
  /**
   * True = this match is AMBIGUOUS (never NONE). Other crisis wording in the
   * same message can still be CLEAR. Unclear cues must return false (stay CLEAR).
   */
  skip?: (text: string, match: RegExpMatchArray) => boolean;
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
 * bare suicidal, tenses) is not matched. Precision guards (negation, up to 2
 * intervening English words, same-clause side-effect questions, same-clause
 * accidental cut) only downgrade that phrase CLEAR → AMBIGUOUS — never NONE,
 * never a separate crisis phrase in the message. A guard fires only on a
 * NARROW POSITIVE match of the whole downgrade construction; anything else
 * stays CLEAR. No exception allowlists.
 */

/** First-person pronouns that may sit immediately before a predicate-start ไม่. */
const NEG_ME_TH = "(?:หนู|เรา|ฉัน|ผม|กู|ดิฉัน|เค้า)";
/**
 * ไม่ / ไม่ค่อย / ไม่เคย / ไม่เคยคิด / ไม่คิดจะ / ไม่ได้ / ไม่ได้คิดจะ at the
 * predicate start: clause start, or right after a first-person pronoun
 * (optional ก็). Must sit at the end of `before` (immediately before อยาก/
 * รู้สึก/คิด + the crisis term). A ไม่ได้ after any other Thai word is not this.
 */
const PREDICATE_START_NEG = new RegExp(
  `(?:^|(?:${NEG_ME_TH})\\s*(?:ก็\\s*)?)ไม่(?:\\s*ค่อย|\\s*เคย(?:\\s*คิด)?|\\s*ได้(?:\\s*คิดจะ)?|\\s*คิดจะ)?\\s*$`,
);
const THAI_INTENT_SUFFIX = /(?:อยาก(?:\s*จะ)?|คิดจะ|รู้สึก)\s*$/;
const EN_DIE_NEG = /(?:don't|dont|do not|never)(?: +\w+){0,2} +$/;
/**
 * Explicit accidental constructions only. Reflexive cut ตัวเอง / ข้อมือ / แขน
 * and any repetition marker stay CLEAR; a bare tool noun is never a cue.
 */
const CUT_REPEAT = /ทุกคืน|ทุกวัน|บ่อย|อีกแล้ว|\bevery\s+(?:night|day)\b|\boften\b/i;
const EXPLICIT_ACCIDENT =
  /โดน.{0,16}บาด|เผลอ(?:ทำ.{0,16})?บาด|บาดตอนโกน|ตอนโกน|ตอนทำกับข้าว|accidentally\s+cut(?:ting)?(?:\s+myself)?|\bcut(?:ting)? myself\b[\s\S]{0,40}\bshav(?:e|ing|ed)\b|\bshav(?:e|ing|ed)\b[\s\S]{0,40}\bcut(?:ting)? myself\b|by accident/i;
/** Help-seeking tails never weaken a disclosure (never downgrade CLEAR). */
const HELP_SEEKING = /มีใครช่วย|ช่วย(?:หนู|ฉัน|ผม|เรา|กู)?ได้ไหม|คุยได้ไหม|ทำไงดี|ทำยังไงดี/;
/**
 * Closed medication / medical-product list (cause of a side-effect question).
 * Generic ยา only counts with an intake verb. Longest first.
 */
const DRUG_TH = "(?:ยาคุมฉุกเฉิน|ยาคุม|ยาต้านไวรัส|ยาฝัง(?:คุมกำเนิด)?|ยาฉีด(?:คุมกำเนิด)?|ฮอร์โมน|วัคซีน|เพร็พ|ถุงยาง)";
const DRUG_EN =
  "(?:birth\\s+control|morning[-\\s]?after(?:\\s+pill)?|emergency\\s+contraception|\\bprep\\b|\\bpep\\b|\\barv\\b|\\biud\\b|\\bcondoms?\\b|\\bvaccines?\\b|\\bhormones?\\b)";
const DRUG_NAME = new RegExp(`${DRUG_TH}|${DRUG_EN}`, "i");
const DRUG_INTAKE = /(?:กิน|ใช้|ฉีด)\s*ยา/;
/** กิน/ใช้/ฉีด <medication> แล้ว immediately before the feeling. */
const DRUG_INTAKE_THEN = new RegExp(
  `(?:กิน|ใช้|ฉีด)\\s*(?:${DRUG_TH}|${DRUG_EN}|ยา[\\wก-๙]*)[ก-๙A-Za-z0-9\\s]{0,24}แล้ว\\s*(?:หนู|เรา|ฉัน|ผม|กู)?\\s*$`,
  "i",
);
const CLAUSE_FINAL_Q = /(?:ได้)?ไหม|มั้ย|\?/;

function isThaiChar(c: string): boolean {
  return /\p{Script=Thai}/u.test(c);
}

/** Clause starts: .!?, Thai particles, แล้ว, question particles, first-person new statements, and spaces between Thai runs. */
function clauseStarts(text: string): number[] {
  const starts = new Set<number>([0]);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (".!?,".includes(ch)) starts.add(i + 1);
    if (/\s/.test(ch)) {
      let left = i - 1;
      while (left >= 0 && /\s/.test(text[left])) left--;
      let right = i + 1;
      while (right < text.length && /\s/.test(text[right])) right++;
      if (left >= 0 && right < text.length && isThaiChar(text[left]) && isThaiChar(text[right])) {
        starts.add(right);
      }
    }
  }
  const particle = /ค่ะ|ครับ|คะ|นะครับ|นะคะ|นะ(?=\s|[.!?.,]|$)|แล้ว/g;
  for (const m of text.matchAll(particle)) {
    starts.add((m.index ?? 0) + m[0].length);
  }
  // Unspaced Thai: split after a question particle when more Thai follows.
  const qEnd = /ไหม|มั้ย|หรือเปล่า|ป่ะ/g;
  for (const m of text.matchAll(qEnd)) {
    const end = (m.index ?? 0) + m[0].length;
    const next = text[end];
    if (next && isThaiChar(next)) starts.add(end);
  }
  // First-person pronoun starting a new statement after ผลข้างเคียง (no ไหม).
  const afterSe = /ผลข้างเคียง(?=หนู|เรา|ฉัน|ผม|กู)/g;
  for (const m of text.matchAll(afterSe)) {
    starts.add((m.index ?? 0) + m[0].length);
  }
  return [...starts].filter((i) => i >= 0 && i <= text.length).sort((a, b) => a - b);
}

function thaiNegationGoverns(before: string): boolean {
  return PREDICATE_START_NEG.test(before);
}

function clauseBounds(text: string, index: number): { start: number; end: number } {
  const starts = clauseStarts(text);
  let start = 0;
  let end = text.length;
  for (const s of starts) {
    if (s <= index) start = s;
    else {
      end = s;
      break;
    }
  }
  return { start, end };
}

function skipThaiNegatedIntent(text: string, m: RegExpMatchArray): boolean {
  const before = text.slice(0, m.index ?? 0);
  if (thaiNegationGoverns(before)) return true;
  if (THAI_INTENT_SUFFIX.test(before) && thaiNegationGoverns(before.replace(THAI_INTENT_SUFFIX, ""))) {
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
  const { start, end } = clauseBounds(text, idx);
  if (thaiNegationGoverns(before) && /^รู้สึก/.test(rest)) return true;
  if (thaiNegationGoverns(before.replace(/\s*รู้สึก\s*$/, "")) && (/^รู้สึก/.test(rest) || /รู้สึก\s*$/.test(before))) {
    return true;
  }
  // Help-seeking tails never weaken a disclosure.
  if (HELP_SEEKING.test(rest)) return false;
  const pre = text.slice(start, idx);
  const post = text.slice(idx, end);
  const clause = text.slice(start, end);
  if (HELP_SEEKING.test(post) || HELP_SEEKING.test(clause)) return false;
  const madeAt = pre.search(/ทำให้/);
  const cause = madeAt >= 0 ? pre.slice(0, madeAt) : "";
  const drugCause = (s: string) => DRUG_NAME.test(s) || DRUG_INTAKE.test(s);
  // Tied to the crisis term: drug + "เป็นผลข้างเคียง / side effect" + question.
  if (drugCause(clause) && /เป็นผลข้างเคียง|ผลข้างเคียง/.test(post) && CLAUSE_FINAL_Q.test(post)) return true;
  if (drugCause(clause) && /\bside[ -]?effects?\b/.test(post) && CLAUSE_FINAL_Q.test(post)) return true;
  // <drug> ทำให้รู้สึก X ได้ไหม — person/place as cause stays CLEAR.
  if (madeAt >= 0 && drugCause(cause) && /รู้สึก/.test(pre + rest.slice(0, 12)) && CLAUSE_FINAL_Q.test(post)) return true;
  if (drugCause(pre) && /\bcauses?\b/.test(pre) && /\?/.test(post)) return true;
  // กิน/ใช้/ฉีด <drug> แล้วรู้สึก X + clause-final question.
  if (DRUG_INTAKE_THEN.test(before) && CLAUSE_FINAL_Q.test(post)) return true;
  return false;
}

function skipDontWantToLive(text: string, m: RegExpMatchArray): boolean {
  const after = text.slice((m.index ?? 0) + m[0].length);
  if (/^\s+in fear\b/.test(after)) return true;
  if (/^\s+together\b/.test(after)) return true;
  return false;
}

function skipAccidentalCut(text: string, m: RegExpMatchArray): boolean {
  const { start, end } = clauseBounds(text, m.index ?? 0);
  const clause = text.slice(start, end);
  // Reflexive self-cut or any repetition marker is always CLEAR, whatever tool.
  if (CUT_REPEAT.test(clause)) return false;
  return EXPLICIT_ACCIDENT.test(clause);
}

function classifyRule(rule: ChatCrisisRule, text: string): ChatCrisisOutcome {
  const flags = rule.re.flags.includes("g") ? rule.re.flags : `${rule.re.flags}g`;
  const re = new RegExp(rule.re.source, flags);
  let ambiguous = false;
  for (const m of text.matchAll(re)) {
    if (rule.skip?.(text, m)) {
      ambiguous = true;
      continue;
    }
    return "clear";
  }
  return ambiguous ? "ambiguous" : "none";
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
  { id: "EN don't want to live", cat: "self_harm", lang: "en", re: /\bi (?:don't|dont|do not) want to live(?: anymore)?(?! with)\b/, skip: skipDontWantToLive },
];

export const TH_F_ID = "TH-F bare follow-up after violence cue";

const prepTh = (t: string) => compact(prepCheckText(t));
const prepEn = (t: string) => normalize(prepCheckText(t)).replace(/[\u2018\u2019]/g, "'");

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
