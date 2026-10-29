/**
 * Add-only output fact check for grounded Jane chat. Never loosens chatGuard.
 * A reply may only state quantities, user-instructions, and permission claims
 * that already appear in the approved card text. Pattern checks cannot catch
 * every wrong fact — that limit is documented on the PR.
 *
 * Synthetic strings only. Never logs text.
 */

import { compact } from "../core/text";

export type FactCheckReason = "quantity" | "instruction" | "permission";

const THAI_NUM = "(?:ยี่สิบ|สิบเอ็ด|สิบ|หนึ่ง|เอ็ด|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|ร้อย|พัน|ครึ่ง)";
const THAI_UNIT = "(?:ปี|ขวบ|วัน|ชั่วโมง|ชม\\.|นาที|สัปดาห์|อาทิตย์|เดือน|เม็ด|โดส|ครั้ง|บาท|เปอร์เซ็นต์)";
const THAI_QTY_RE = new RegExp(`${THAI_NUM}\\s*${THAI_UNIT}|${THAI_UNIT}\\s*${THAI_NUM}`, "gu");

const EN_NUM =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|nineteen)";
const EN_UNIT =
  "(?:days?|hours?|hrs?|weeks?|months?|years?|minutes?|mins?|pills?|tablets?|doses?|mg|baht|percent)";
const EN_QTY_RE = new RegExp(`\\b${EN_NUM}\\s+(?:a\\s+)?${EN_UNIT}\\b|\\b${EN_UNIT}\\s+${EN_NUM}\\b`, "gi");

const PLACE_TERMS = [
  "โรงพยาบาล", "คลินิก", "ร้านขายยา", "ศูนย์พึ่งได้", "สภากาชาด", "หน่วยบริการ",
  "ร้านสะดวกซื้อ", "สายด่วน", "hospital", "clinic", "pharmacy", "hotline",
] as const;

const PRICE_TERMS = ["บาท", "ราคา", "baht"] as const;

type Needle = string | RegExp;

const HEAT: readonly Needle[] = ["heat", "heating", "อุ่น", "ต้ม", "ลวก", "เผา", "ไมโครเวฟ", "ตั้งไฟ"];
const WASH: readonly Needle[] = ["wash", "washing", "ล้าง", "ซัก"];
const INSERT: readonly Needle[] = ["insert", "inserting", "สอด"];
const APPLY: readonly Needle[] = ["apply", "applying", "ทา"];
const TAKE: readonly Needle[] = ["take", "taking", "กินยา", "รับประทาน", /กิน.{0,12}เม็ด/u];
const INSTRUCTION_GROUPS: readonly (readonly Needle[])[] = [HEAT, WASH, INSERT, APPLY, TAKE];

const PERMISSION_TH = [
  "ผู้ปกครอง", "พ่อแม่", "บิดามารดา", "ใบสั่งแพทย์", "ใบสั่งยา", "ยินยอม", "อนุญาต",
] as const;
const PERMISSION_EN = ["parent", "parents", "guardian", "prescription", "permission"] as const;

function nfc(s: string): string {
  return s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function englishWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function needleIn(text: string, n: Needle): boolean {
  if (typeof n !== "string") return n.test(text);
  if (/^[a-z]+$/i.test(n)) return englishWord(text, n);
  return compact(text).includes(compact(n));
}

function digitRuns(text: string): string[] {
  return text.match(/[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*/g) ?? [];
}

function qtySpans(text: string, re: RegExp): string[] {
  return [...text.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0]!);
}

function extraQuantities(reply: string, card: string): boolean {
  for (const run of digitRuns(reply)) {
    if (!card.includes(run)) return true;
  }
  for (const span of [...qtySpans(reply, THAI_QTY_RE), ...qtySpans(reply, EN_QTY_RE)]) {
    if (!compact(card).includes(compact(span))) return true;
  }
  for (const term of PLACE_TERMS) {
    if (needleIn(reply, term) && !needleIn(card, term)) return true;
  }
  for (const term of PRICE_TERMS) {
    if (needleIn(reply, term) && !needleIn(card, term)) return true;
  }
  return false;
}

function extraInstruction(reply: string, card: string): boolean {
  for (const group of INSTRUCTION_GROUPS) {
    if (group.some((n) => needleIn(reply, n)) && !group.some((n) => needleIn(card, n))) return true;
  }
  return false;
}

function extraPermission(reply: string, card: string): boolean {
  for (const p of PERMISSION_TH) {
    if (compact(reply).includes(compact(p)) && !compact(card).includes(compact(p))) return true;
  }
  for (const p of PERMISSION_EN) {
    if (englishWord(reply, p) && !englishWord(card, p)) return true;
  }
  return false;
}

/** Failed fact-check reasons (empty = accept). Add-only; never logs text. */
export function chatFactCheckFailures(reply: string | null | undefined, cardText: string | null | undefined): FactCheckReason[] {
  const raw = nfc(reply == null ? "" : String(reply));
  const card = nfc(cardText == null ? "" : String(cardText));
  if (!raw.trim()) return [];
  const fails: FactCheckReason[] = [];
  if (extraQuantities(raw, card)) fails.push("quantity");
  if (extraInstruction(raw, card)) fails.push("instruction");
  if (extraPermission(raw, card)) fails.push("permission");
  return fails;
}

export function acceptChatFacts(
  reply: string | null | undefined,
  cardText: string | null | undefined,
): { ok: true } | { ok: false; reasons: FactCheckReason[] } {
  const reasons = chatFactCheckFailures(reply, cardText);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true };
}
