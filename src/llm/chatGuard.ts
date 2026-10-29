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

const DOSE_PHRASES = [
  "เม็ด", "มก.", "มก", "มิลลิกรัม", "ขนาดยา", "โดส", "dosage", "กินกี่",
  "ยาคุม", "ยาฉุกเฉิน", "ยาฆ่าเชื้อ", "ยาปฏิชีวนะ", "ยาแพ้", "ยาแก้ปวด",
] as const;

const CLAIM_PHRASES = [
  "ไม่ท้องแน่", "ไม่ท้องแน่นอน", "แน่นอน", "รับรองว่า", "หายขาด", "วินิจฉัย",
  "ปลอดภัย 100", "ปลอดภัยร้อย", "ติดแน่", "ไม่ติดแน่", "เป็นโรค",
] as const;

const OUTPUT_GUARD_REASONS = ["roleplay", "explicit", "image"] as const satisfies readonly GuardReason[];

function nfc(s: string): string {
  return s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
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
  if (findPhrases(raw, DOSE_PHRASES).length) fails.push("dose");
  if (findPhrases(raw, CLAIM_PHRASES).length) fails.push("claim");
  for (const r of OUTPUT_GUARD_REASONS) {
    if (findPhrases(raw, GUARD_RULES[r]).length) fails.push(r);
  }
  if (detectCrisis(raw).level !== "none") fails.push("crisis");
  if (stripPII(raw) !== raw) fails.push("pii");
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
