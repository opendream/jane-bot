import { detectCrisis } from "../core/crisis";
import { GUARD_RULES, type GuardReason } from "../core/guard";
import { stripPII } from "../core/summary";
import { findPhrases } from "../core/text";

/**
 * Output guard for free-generated Jane chat (PR A). Pinned `src/core/guard.ts` is imported
 * read-only. A reject replaces the model line with CHAT_HOLDING_LINE; it never blocks a card.
 *
 * DRAFT copy (holding line): Thai review pending.
 */

export const CHAT_HOLDING_LINE = "พี่ฟังอยู่นะ ขอส่งข้อมูลที่ตรวจแล้วให้ก่อน";
export const CHAT_MAX_CHARS = 160;

export type ChatGuardReason =
  | "empty"
  | "digits"
  | "url"
  | "handle"
  | "email"
  | "phone"
  | "dose"
  | "claim"
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
  "ไม่ท้องแน่", "ไม่ท้องแน่นอน", "รับรองว่า", "หายขาด", "วินิจฉัย",
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

/** All failed checks for a generated reply (empty array = accept). Never logs text. */
export function chatGuardFailures(text: string | null | undefined): ChatGuardReason[] {
  const fails: ChatGuardReason[] = [];
  const raw = text == null ? "" : nfc(String(text));
  if (!raw.trim()) return ["empty"];
  if (/[0-9๐-๙]/.test(raw)) fails.push("digits");
  if (/https?:\/\/|www\.|[\w.-]+\.(com|net|org|io|co|th)\b/i.test(raw)) fails.push("url");
  if (/(^|[^A-Za-z0-9._])@[A-Za-z0-9._]{2,}/.test(raw)) fails.push("handle");
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(raw)) fails.push("email");
  if (/(?:\+66|0[689])[\d๐-๙\s-]{7,}/.test(raw) || /โทร\s*[\d๐-๙]/.test(raw)) fails.push("phone");
  if (findPhrases(raw, DOSE_PHRASES).length || THAI_QTY_RE.test(raw) || LATIN_QTY_RE.test(raw)) fails.push("dose");
  if (findPhrases(raw, CLAIM_PHRASES).length) fails.push("claim");
  for (const r of OUTPUT_GUARD_REASONS) {
    if (findPhrases(raw, GUARD_RULES[r]).length) fails.push(r);
  }
  if (detectCrisis(raw).level !== "none") fails.push("crisis");
  if (stripPII(raw) !== whitespaceNorm(raw)) fails.push("pii");
  if (/<\/?think>|\/no_think|<\|im_(start|end)\|>/i.test(raw)) fails.push("think");
  if (raw.length > CHAT_MAX_CHARS) fails.push("length");
  if (!mostlyThai(raw)) fails.push("script");
  return fails;
}

export function acceptChatReply(text: string | null | undefined): { ok: true; text: string } | { ok: false; reasons: ChatGuardReason[] } {
  const reasons = chatGuardFailures(text);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, text: nfc(String(text)).trim() };
}
