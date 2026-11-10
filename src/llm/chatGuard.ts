import { detectCrisis } from "../core/crisis";
import { GUARD_RULES, type GuardReason } from "../core/guard";
import { stripPII } from "../core/summary";
import { findPhrases } from "../core/text";
import { type ChatLang, mostlyLatin } from "./chat-lang";

/**
 * Output guard for free-generated Jane chat (PR A). Pinned `src/core/guard.ts` is imported
 * read-only. Chat-first retries once, then shows the rules' top card on its own.
 */

export const CHAT_MAX_CHARS = 160;
export const CHAT_MAX_CHARS_EN = 220;

export type ChatGuardReason =
  | "empty"
  | "digits"
  | "url"
  | "handle"
  | "email"
  | "phone"
  | "dose"
  | "advice"
  | "claim"
  | "price"
  | "roleplay"
  | "explicit"
  | "image"
  | "crisis"
  | "pii"
  | "think"
  | "length"
  | "script";

/**
 * Dose/timing *patterns* — compound phrases, not units.
 * Short unit tokens (เม็ด / มก / มก. / โดส / mg / dosage / มิลลิกรัม) are matched only
 * next to a number word below: มก is a substring of คุมกำเนิด, so a bare needle is unsafe.
 * Remaining phrases are compounds (ขนาดยา, วันละ, ยาแพ้, …) audited against common Thai chat.
 */
const DOSE_PHRASES = [
  "ขนาดยา", "ยาฆ่าเชื้อ", "ยาปฏิชีวนะ", "ยาแพ้", "ยาแก้ปวด",
  "กินภายใน", "วันละ", "ครั้งละ",
] as const;

/** Absolute-claim *patterns* — not a bare แน่นอน. Shortest remaining compounds: ติดแน่ / หายขาด / เป็นโรค. */
const CLAIM_PHRASES = [
  "ไม่ท้องแน่", "ไม่ท้องแน่นอน", "จะไม่ท้อง", "รับรองว่า", "หายขาด", "วินิจฉัย",
  "ปลอดภัย 100", "ปลอดภัยร้อย", "ติดแน่", "ไม่ติดแน่", "เป็นโรค",
] as const;

const OUTPUT_GUARD_REASONS = ["roleplay", "explicit", "image"] as const satisfies readonly GuardReason[];

/** Longest first so ยี่สิบ wins over สิบ. กี่ / หลาย count as quantity words next to a unit. */
const THAI_NUM = "(?:ยี่สิบ|สิบ|หนึ่ง|เอ็ด|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|ร้อย|พัน|ครึ่ง|กี่|หลาย)";
/** Time/dose units. มก is only a unit with a period, space, or end — never the มก inside ห้ามกด / คุมกำเนิด. */
const QTY_UNIT = "(?:มิลลิกรัม|มก(?:\\.|$|(?=\\s))|เม็ด|โดส|mg|วัน|ชั่วโมง|ชม\\.|ครั้ง|สัปดาห์|อาทิตย์|เดือน|ปี|นาที|ขวบ)";
const THAI_QTY_RE = new RegExp(`${THAI_NUM}\\s*${QTY_UNIT}|${QTY_UNIT}\\s*${THAI_NUM}`, "iu");
/** Latin dose units as whole words, and only beside a number word (digits already fail the digit check). */
const LATIN_QTY_RE = new RegExp(`(?:${THAI_NUM})\\s*(?:dosage|mg)\\b|\\b(?:dosage|mg)\\s*(?:${THAI_NUM})`, "iu");
/**
 * Dose nouns (not time units). Number words / เดียว may sit a short span away
 * (เม็ดเดียว, กินเม็ดเดียว) rather than only directly adjacent.
 */
const THAI_DOSE_NOUN = "(?:เม็ด|โดส)";
const THAI_DOSE_COUNT = `(?:${THAI_NUM}|เดียว)`;
const THAI_DOSE_SPAN_RE = new RegExp(
  `${THAI_DOSE_COUNT}.{0,8}?${THAI_DOSE_NOUN}|${THAI_DOSE_NOUN}.{0,8}?${THAI_DOSE_COUNT}`,
  "iu",
);
/** Imperative กิน + count, only when a dose noun is also in a short span. */
const THAI_EAT_DOSE_RE = new RegExp(
  `กิน.{0,16}?(?:${THAI_DOSE_SPAN_RE.source})|(?:${THAI_DOSE_SPAN_RE.source}).{0,16}?กิน`,
  "iu",
);

const EN_NUM =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half)";
const EN_UNIT =
  "(?:days?|hours?|hrs?|weeks?|months?|years?|minutes?|mins?|seconds?|times?|pills?|tablets?|doses?|mg|milligrams?)";
/** Number word next to a unit / time word. `mg` only as a unit, never a bare substring. */
const EN_QTY_RE = new RegExp(`\\b${EN_NUM}\\s+(?:a\\s+)?${EN_UNIT}\\b|\\b${EN_UNIT}\\s+${EN_NUM}\\b`, "i");
const EN_FREQ_RE = /\b(?:once|twice)\s+(?:a\s+)?(?:day|week|month|year|hour)\b/i;
const EN_DOSE_PHRASE_RE = /\b(?:pills?|tablets?|doses?)\s+per\s+(?:day|week|month)\b|\btake\s+(?:it\s+)?within\b/i;
const EN_DOSE_NOUN = "(?:pills?|tablets?|doses?)";
/** Number word and a dose noun within up to four intervening words. */
const EN_DOSE_SPAN_RE = new RegExp(
  `\\b${EN_NUM}\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b${EN_DOSE_NOUN}\\b|\\b${EN_DOSE_NOUN}\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b${EN_NUM}\\b`,
  "i",
);
/** Imperative take + a number word, only when a dose noun is also nearby. */
const EN_TAKE_DOSE_RE = new RegExp(
  `\\btake\\b(?:[\\s,.-]+\\w+){0,6}[\\s,.-]+\\b${EN_NUM}\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b${EN_DOSE_NOUN}\\b|\\btake\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b${EN_DOSE_NOUN}\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b${EN_NUM}\\b`,
  "i",
);

const RESULT_TIME = "(?:พรุ่งนี้|มะรืน|วันนี้|ตอนนี้|ทันที|ชั่วโมง|ชม\\.|นาที|เช้า|เย็น|คืนนี้|วันหลัง|วันถัด|เดี๋ยวนี้)";
const RESULT_CLAIM_RE = new RegExp(`รู้ผล.{0,20}?${RESULT_TIME}|${RESULT_TIME}.{0,20}?รู้ผล`, "u");

const EN_CLAIM_PHRASES = [
  "100% safe",
  "one hundred percent safe",
  "one hundred percent",
  "guaranteed",
  "you definitely have",
  "you definitely don't have",
  "you definitely do not have",
  "you're not pregnant",
  "you are not pregnant",
  "won't get pregnant",
  "will not get pregnant",
  "not get pregnant",
  "definitely",
] as const;
const EN_CURE_RE = /\bcure[ds]?\b/i;
const EN_GUARANTEE_RE = /\bguarantee(?:d|s)?\b|\bdefinitely\b|\b100\s*%/i;

const PRICE_TOKEN_TH = "(?:ราคา|บาท)";
const THAI_PRICE_RE = new RegExp(`${PRICE_TOKEN_TH}.{0,16}?${THAI_NUM}|${THAI_NUM}.{0,16}?${PRICE_TOKEN_TH}`, "u");
const EN_PRICE = "(?:baht|costs?|price)";
const EN_PRICE_RE = new RegExp(
  `\\b${EN_PRICE}\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b${EN_NUM}\\b|\\b${EN_NUM}\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b${EN_PRICE}\\b`,
  "i",
);

const EN_EXPLICIT_EXTRA_RE = /\b(?:sexual scenes?|sex scenes?)\b/i;

function nfc(s: string): string {
  return s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/** Same whitespace collapse stripPII applies after redaction, so whitespace alone is not PII. */
function whitespaceNorm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

function mostlyThai(s: string): boolean {
  const thai = (s.match(/[\u0E00-\u0E7F]/g) ?? []).length;
  const latin = (s.match(/[A-Za-z]/g) ?? []).length;
  if (thai + latin === 0) return true;
  return thai > 0 && thai >= latin;
}

function thaiDose(raw: string): boolean {
  return !!(
    findPhrases(raw, DOSE_PHRASES).length
    || THAI_QTY_RE.test(raw)
    || LATIN_QTY_RE.test(raw)
    || THAI_DOSE_SPAN_RE.test(raw)
    || THAI_EAT_DOSE_RE.test(raw)
  );
}

function englishDose(raw: string): boolean {
  return EN_QTY_RE.test(raw)
    || EN_FREQ_RE.test(raw)
    || EN_DOSE_PHRASE_RE.test(raw)
    || EN_DOSE_SPAN_RE.test(raw)
    || EN_TAKE_DOSE_RE.test(raw);
}

function thaiClaim(raw: string): boolean {
  return !!(findPhrases(raw, CLAIM_PHRASES).length || RESULT_CLAIM_RE.test(raw));
}

function englishClaim(raw: string): boolean {
  return !!(findPhrases(raw, EN_CLAIM_PHRASES).length || EN_CURE_RE.test(raw) || EN_GUARANTEE_RE.test(raw));
}

/**
 * Instruction / permission to take a named medicine or contraceptive method.
 * Topic mentions without an imperative (คุยเรื่องยาคุมได้เลย) stay allowed.
 */
const MED_TH =
  "(?:ยาคุมฉุกเฉิน|ยาฉุกเฉิน|ยาคุม|ยาแก้ปวด|ยาฆ่าเชื้อ|ยาปฏิชีวนะ|ยาแพ้|ยาฝัง|ยาฉีด|เพรพ|เปป|PrEP|PEP|prep|pep)";
const THAI_ADVICE_RE = new RegExp(
  `(?:ให้กิน|ควรกิน|ลองกิน|ให้ทาน|ควรทาน|ลองทาน|ให้ใช้|ควรใช้|ลองใช้).{0,20}?${MED_TH}`
  + `|(?:กิน|ทาน|ใช้).{0,20}?${MED_TH}.{0,12}?(?:ได้เลย|ไปเลย|เลย)`
  + `|${MED_TH}.{0,12}?(?:ให้กิน|ควรกิน|ลองกิน|กินได้เลย|ใช้ได้เลย|ใช้เลย)`
  + `|${MED_TH}.{0,12}?(?:เม็ด|มก\\.?|mg|โดส)|(?:เม็ด|มก\\.?|mg|โดส).{0,12}?${MED_TH}`,
  "iu",
);

const MED_EN =
  "(?:emergency contraception|emergency contraceptive(?: pills?)?|birth control(?: pills?)?|plan b|prep|pep|painkillers?|ibuprofen|paracetamol|the pill|contraceptive(?: pills?)?)";
const EN_ADVICE_RE = new RegExp(
  `\\b(?:go ahead and |just |please )?(?:take|taking|use|using|swallow)\\b(?:[\\s,.-]+\\w+){0,6}[\\s,.-]*\\b${MED_EN}\\b`
  + `|\\b(?:you (?:can|should|could|may|need to)|try )(?:take|taking|use|using)\\b(?:[\\s,.-]+\\w+){0,6}[\\s,.-]*\\b${MED_EN}\\b`
  + `|\\b${MED_EN}\\b(?:[\\s,.-]+\\w+){0,4}[\\s,.-]+\\b(?:mg|milligrams?|pills?|tablets?|doses?)\\b`,
  "i",
);

function thaiAdvice(raw: string): boolean {
  return THAI_ADVICE_RE.test(raw);
}

function englishAdvice(raw: string): boolean {
  return EN_ADVICE_RE.test(raw);
}

function thaiPrice(raw: string): boolean {
  return THAI_PRICE_RE.test(raw);
}

function englishPrice(raw: string): boolean {
  return EN_PRICE_RE.test(raw);
}

/** All failed checks for a generated reply (empty array = accept). Never logs text. */
export function chatGuardFailures(
  text: string | null | undefined,
  lang: ChatLang = "th",
): ChatGuardReason[] {
  const fails: ChatGuardReason[] = [];
  const raw = text == null ? "" : nfc(String(text));
  if (!raw.trim()) return ["empty"];
  if (/[0-9๐-๙]/.test(raw)) fails.push("digits");
  if (/https?:\/\/|www\.|[\w.-]+\.(com|net|org|io|co|th)\b/i.test(raw)) fails.push("url");
  if (/(^|[^A-Za-z0-9._])@[A-Za-z0-9._]{2,}/.test(raw)) fails.push("handle");
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(raw)) fails.push("email");
  if (/(?:\+66|0[689])[\d๐-๙\s-]{7,}/.test(raw) || /โทร\s*[\d๐-๙]/.test(raw)) fails.push("phone");
  if (lang === "en" ? englishDose(raw) : thaiDose(raw)) fails.push("dose");
  if (lang === "en" ? englishAdvice(raw) : thaiAdvice(raw)) fails.push("advice");
  if (lang === "en" ? englishClaim(raw) : thaiClaim(raw)) fails.push("claim");
  if (lang === "en" ? englishPrice(raw) : thaiPrice(raw)) fails.push("price");
  for (const r of OUTPUT_GUARD_REASONS) {
    if (findPhrases(raw, GUARD_RULES[r]).length) fails.push(r);
  }
  if (lang === "en" && EN_EXPLICIT_EXTRA_RE.test(raw) && !fails.includes("explicit")) fails.push("explicit");
  if (detectCrisis(raw).level !== "none") fails.push("crisis");
  if (stripPII(raw) !== whitespaceNorm(raw)) fails.push("pii");
  if (/<\/?think>|\/no_think|<\|im_(start|end)\|>/i.test(raw)) fails.push("think");
  if (raw.length > (lang === "en" ? CHAT_MAX_CHARS_EN : CHAT_MAX_CHARS)) fails.push("length");
  if (lang === "en" ? !mostlyLatin(raw) : !mostlyThai(raw)) fails.push("script");
  return fails;
}

export function acceptChatReply(
  text: string | null | undefined,
  lang: ChatLang = "th",
): { ok: true; text: string } | { ok: false; reasons: ChatGuardReason[] } {
  const reasons = chatGuardFailures(text, lang);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, text: nfc(String(text)).trim() };
}
