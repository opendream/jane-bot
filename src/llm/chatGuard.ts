import { detectCrisis } from "../core/crisis";
import { GUARD_RULES, type GuardReason } from "../core/guard";
import { stripPII } from "../core/summary";
import { findPhrases } from "../core/text";
// Shared phone spans (pinned pii-patterns). Thai/international, spaced/dashed, Thai numerals.
// @ts-ignore
import { findPhoneSpans } from "../../scripts/bank/pii-patterns.mjs";
import { HEALTH_LOANWORDS, type ChatLang, mostlyLatin } from "./chat-lang";

/**
 * Output guard for free-generated Jane chat (PR A). Pinned `src/core/guard.ts` is imported
 * read-only. Chat-first retries once, then shows the rules' top card on its own.
 */

/**
 * Two short Thai sentences plus a margin for a 128-token 0.6B dump after
 * sentence-trim. Longer rambling is capped here instead of rejected.
 */
export const CHAT_MAX_CHARS = 320;
export const CHAT_MAX_CHARS_EN = 400;

export type ChatGuardReason =
  | "empty"
  | "digits"
  | "url"
  | "handle"
  | "email"
  | "phone"
  | "dose"
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

const HEALTH_LOANWORD_SET = new Set<string>(HEALTH_LOANWORDS);

/** Distinctive system-prompt fragments. Echoing these is leakage, not chat. */
const PROMPT_LEAK_TH = ["คุณคือเจน", "ห้ามให้ข้อมูลทางการแพทย์ของตัวเอง"] as const;
const PROMPT_LEAK_EN = ["You are P'Jane", "Do not give your own medical facts"] as const;

/** Absolute-claim *patterns* — not a bare แน่นอน. Shortest remaining compounds: ติดแน่ / หายขาด / เป็นโรค. */
const CLAIM_PHRASES = [
  "ไม่ท้องแน่", "ไม่ท้องแน่นอน", "จะไม่ท้อง", "รับรองว่า", "หายขาด", "วินิจฉัย",
  "ปลอดภัย 100", "ปลอดภัยร้อย", "ติดแน่", "ไม่ติดแน่", "เป็นโรค",
] as const;

const OUTPUT_GUARD_REASONS = ["roleplay", "explicit", "image"] as const satisfies readonly GuardReason[];

/** Longest first so ยี่สิบ wins over สิบ. Used next to ราคา/บาท for the price check. */
const THAI_NUM = "(?:ยี่สิบ|สิบ|หนึ่ง|เอ็ด|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|ร้อย|พัน|ครึ่ง|กี่|หลาย)";

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

const EN_NUM =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half)";

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

function stripHealthLoanwords(s: string): string {
  return s.replace(/[A-Za-z]+/g, (tok) => (HEALTH_LOANWORD_SET.has(tok.toLowerCase()) ? " " : tok));
}

/**
 * Thai-script ratio for a Thai session. Digits, punctuation, and allowlisted
 * health loanwords (PrEP, PEP, HIV, …) are neutral — they do not count against
 * Thai. Leftover Latin that is not a loanword does.
 */
function mostlyThai(s: string): boolean {
  const thaiLetters = (text: string) =>
    (text.match(/[\u0E00-\u0E7F]/g) ?? []).filter((c) => !/[๐-๙]/.test(c)).length;
  if (thaiLetters(s) === 0) return false;
  const stripped = stripHealthLoanwords(s);
  const thai = thaiLetters(stripped);
  const latin = (stripped.match(/[A-Za-z]/g) ?? []).length;
  if (thai + latin === 0) return true;
  return thai / (thai + latin) >= 0.4;
}

/**
 * Strip Qwen3 think markup before the guard, including truncated dumps:
 * - closed `<think>...</think>` is removed
 * - an unclosed `<think>` drops everything from it to the end
 * - a stray `</think>` with no opener drops everything before it
 */
function stripThink(s: string): string {
  let out = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "\n");
  out = out.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  out = out.replace(/^[\s\S]*?<\/think>/gi, "");
  return out
    .replace(/\/no_think/gi, " ")
    .replace(/<\|im_(start|end)\|>/gi, " ");
}

/** First ~160 characters of rejected raw model output. Memory / on-screen only. */
export const CHAT_GUARD_DEBUG_RAW_CHARS = 160;

export function chatGuardDebugRawPreview(text: string | null | undefined): string {
  const s = text == null ? "" : String(text).replace(/\s+/g, " ").trim();
  return s.slice(0, CHAT_GUARD_DEBUG_RAW_CHARS);
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*>\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

const ROLE_PREFIX =
  /^(?:(?:P['’]?Jane|Jane|เจน|assistant|user|system)\s*[:：]\s*)+/i;
const BARE_ROLE_LINE = /^(?:assistant|user|system|jane|เจน)\s*$/i;

function stripRolePrefixes(s: string): string {
  return s
    .split(/\n/)
    .map((line) => {
      if (BARE_ROLE_LINE.test(line.trim())) return "";
      return line.replace(ROLE_PREFIX, "");
    })
    .join("\n");
}

function dropLeadingNonThaiLines(s: string, lang: ChatLang): string {
  if (lang !== "th") return s;
  const lines = s.split(/\n/);
  const i = lines.findIndex((l) => /[\u0E00-\u0E7F]/.test(l));
  if (i <= 0) return s;
  return lines.slice(i).join("\n");
}

function collapseWs(s: string): string {
  return s.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Drop CJK / Hangul / Cyrillic / emoji / stray symbols so a mostly-Thai reply
 * is not rejected for a few garbage code points. Thai, Latin (loanwords),
 * digits, marks, punctuation, and whitespace stay.
 */
function stripStrayScripts(s: string): string {
  return s
    .replace(/[^\p{Script=Thai}\p{Script=Latin}\p{N}\p{M}\p{P}\p{Z}]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lastSentenceEnd(s: string, lang: ChatLang): number {
  const re = lang === "en"
    ? /[.!?](?=\s|$)/g
    : /นะคะ[?？!！]?|ค่ะ[?？!！]?|ครับ[?？!！]?|คะ[?？!！]?|[?？!！。]/g;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) last = m.index + m[0].length;
  return last;
}

function trimToLastCompleteSentence(s: string, lang: ChatLang): string {
  const end = lastSentenceEnd(s, lang);
  if (end <= 0) return s.trim();
  const rest = s.slice(end).trim();
  if (!rest) return s.trim();
  return s.slice(0, end).trim();
}

function capLength(s: string, max: number, lang: ChatLang): string {
  if (s.length <= max) return s;
  const sliced = s.slice(0, max);
  const trimmed = trimToLastCompleteSentence(sliced, lang);
  if (trimmed.length > 0 && trimmed.length <= max) return trimmed;
  return sliced.trim();
}

/**
 * Strip Qwen3 think tags, role prefixes, and markdown; drop stray non-Thai
 * scripts; drop a trailing truncated clause; cap length. Idempotent. Does not log text.
 */
export function normaliseChatReply(text: string | null | undefined, lang: ChatLang = "th"): string {
  let s = text == null ? "" : nfc(String(text));
  s = stripThink(s);
  s = stripMarkdown(s);
  s = dropLeadingNonThaiLines(s, lang);
  s = stripRolePrefixes(s);
  s = collapseWs(s);
  s = s.replace(/\n+/g, " ").trim();
  s = stripStrayScripts(s);
  s = trimToLastCompleteSentence(s, lang);
  s = capLength(s, lang === "en" ? CHAT_MAX_CHARS_EN : CHAT_MAX_CHARS, lang);
  return s.trim();
}

function leftoverThink(s: string): boolean {
  return /<\/?think>|\/no_think|<\|im_(start|end)\|>/i.test(s);
}

function leftoverJson(s: string): boolean {
  return /^\s*[{\[]/.test(s);
}

/**
 * Full Thai/international numbers, plus a call/hotline word then 3+ digits
 * (Thai or Arabic, spaces/dashes ok) in a short window. No blanket digit ban:
 * "72 ชั่วโมง" without a call word still passes.
 */
const PHONE_DIGIT_RUN = String.raw`[+＋]?[0-9๐-๙](?:[\s.-]*[0-9๐-๙]){2,}`;
const CALL_TO_DIGITS_GAP = String.raw`[^0-9๐-๙]{0,24}`;
const TH_CALL_PHONE_RE = new RegExp(`(?:โทร|ติดต่อ|สายด่วน)${CALL_TO_DIGITS_GAP}${PHONE_DIGIT_RUN}`);
const EN_CALL_PHONE_RE = new RegExp(`\\b(?:call|hotline)s?\\b${CALL_TO_DIGITS_GAP}${PHONE_DIGIT_RUN}`, "i");

function hasPhoneNumber(s: string): boolean {
  if (findPhoneSpans(s).length) return true;
  return TH_CALL_PHONE_RE.test(s) || EN_CALL_PHONE_RE.test(s);
}

function promptLeak(s: string, lang: ChatLang): boolean {
  const needles = lang === "en" ? PROMPT_LEAK_EN : PROMPT_LEAK_TH;
  return needles.some((n) => s.includes(n));
}

function thaiClaim(raw: string): boolean {
  return !!(findPhrases(raw, CLAIM_PHRASES).length || RESULT_CLAIM_RE.test(raw));
}

function englishClaim(raw: string): boolean {
  return !!(findPhrases(raw, EN_CLAIM_PHRASES).length || EN_CURE_RE.test(raw) || EN_GUARANTEE_RE.test(raw));
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
  const incoming = text == null ? "" : nfc(String(text));
  if (!incoming.trim()) return ["empty"];
  const raw = normaliseChatReply(incoming, lang);
  if (!raw.trim()) return ["empty"];
  if (/https?:\/\/|www\.|[\w.-]+\.(com|net|org|io|co|th)\b/i.test(raw)) fails.push("url");
  if (/(^|[^A-Za-z0-9._])@[A-Za-z0-9._]{2,}/.test(raw)) fails.push("handle");
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(raw)) fails.push("email");
  if (hasPhoneNumber(raw)) fails.push("phone");
  if (lang === "en" ? englishClaim(raw) : thaiClaim(raw)) fails.push("claim");
  if (lang === "en" ? englishPrice(raw) : thaiPrice(raw)) fails.push("price");
  for (const r of OUTPUT_GUARD_REASONS) {
    if (findPhrases(raw, GUARD_RULES[r]).length) fails.push(r);
  }
  if (lang === "en" && EN_EXPLICIT_EXTRA_RE.test(raw) && !fails.includes("explicit")) fails.push("explicit");
  if (detectCrisis(raw).level !== "none") fails.push("crisis");
  if (stripPII(raw) !== whitespaceNorm(raw)) fails.push("pii");
  if (leftoverThink(raw) || leftoverJson(raw) || promptLeak(raw, lang)) fails.push("think");
  if (lang === "en" ? !mostlyLatin(raw) : !mostlyThai(raw)) fails.push("script");
  return fails;
}

export function acceptChatReply(
  text: string | null | undefined,
  lang: ChatLang = "th",
): { ok: true; text: string } | { ok: false; reasons: ChatGuardReason[] } {
  const reasons = chatGuardFailures(text, lang);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, text: normaliseChatReply(text, lang) };
}
