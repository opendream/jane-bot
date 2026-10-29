/**
 * Add-only output fact check for grounded Jane chat. Never loosens chatGuard.
 *
 * Core: every content word in the reply must appear in the approved card's
 * word set (Intl.Segmenter) or in the reviewed conversational allowlist.
 * Numbers in any form must match a value that is on the card. The old
 * denylist (instruction / permission / place / price) stays as an extra
 * layer, matched at word level so ทา≠ทาน and ซัก in ซักถาม do not trip it.
 *
 * Pattern + coverage checks cannot catch every wrong fact — that limit is
 * documented on the PR. Synthetic strings only. Never logs text.
 */

import { compact } from "../core/text";
import { CHAT_COVERAGE_ALLOW_SET } from "./chat-factcheck-allow";
import {
  extractNumberSpans,
  hasWordSegmenter,
  insideSpan,
  normWord,
  numberValues,
  parseNumberToken,
  wordSpans,
} from "./chat-words";

export type FactCheckReason = "quantity" | "instruction" | "permission" | "coverage";

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

/** Same-act aliases: only when the card already has one of the group. */
const VERB_ALIASES: readonly (readonly string[])[] = [
  ["กิน", "ทาน", "ประทาน"],
];

function nfc(s: string): string {
  return s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function englishWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function qtySpans(text: string, re: RegExp): string[] {
  return [...text.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0]!);
}

function cardWordSet(card: string): Set<string> {
  const set = new Set(wordSpans(card).map((w) => normWord(w.word)));
  for (const group of VERB_ALIASES) {
    if (group.some((v) => set.has(v))) for (const v of group) set.add(v);
  }
  return set;
}

function ngramAt(words: readonly string[], i: number, len: number): string | null {
  if (i < 0 || i + len > words.length) return null;
  return words.slice(i, i + len).map(normWord).join("");
}

function allowCovers(words: readonly string[], i: number): boolean {
  const w = normWord(words[i]!);
  if (CHAT_COVERAGE_ALLOW_SET.has(w)) return true;
  for (let len = 2; len <= 4; len++) {
    for (let start = Math.max(0, i - len + 1); start <= i; start++) {
      const gram = ngramAt(words, start, len);
      if (gram && CHAT_COVERAGE_ALLOW_SET.has(gram)) return true;
    }
  }
  return false;
}

function spanCoveredByAllow(words: readonly string[], from: number, to: number): boolean {
  for (let end = to; end < Math.min(words.length, from + 4); end++) {
    const gram = ngramAt(words, from, end - from + 1);
    if (!gram || !CHAT_COVERAGE_ALLOW_SET.has(gram)) continue;
    if (end > to) return true;
    if (end === to && from !== to) return true;
  }
  if (from === to) {
    for (let end = from + 1; end < Math.min(words.length, from + 4); end++) {
      const gram = ngramAt(words, from, end - from + 1);
      if (gram && CHAT_COVERAGE_ALLOW_SET.has(gram)) return true;
    }
  }
  return false;
}

function thaiPhrasePresent(words: readonly string[], needle: string): boolean {
  const want = compact(needle);
  if (!want) return false;
  for (let i = 0; i < words.length; i++) {
    let acc = "";
    for (let j = i; j < words.length; j++) {
      acc += compact(words[j]!);
      if (acc === want) return !spanCoveredByAllow(words, i, j);
      if (acc.length > want.length) break;
    }
  }
  return false;
}

function needleInWords(text: string, words: readonly string[], n: Needle): boolean {
  if (typeof n !== "string") return n.test(text);
  if (/^[a-z]+$/i.test(n)) return englishWord(text, n);
  return thaiPhrasePresent(words, n);
}

function extraQuantities(reply: string, card: string, replyWords: readonly string[], cardWords: readonly string[]): boolean {
  for (const span of [...qtySpans(reply, THAI_QTY_RE), ...qtySpans(reply, EN_QTY_RE)]) {
    if (!compact(card).includes(compact(span))) return true;
  }
  for (const term of PLACE_TERMS) {
    if (needleInWords(reply, replyWords, term) && !needleInWords(card, cardWords, term)) return true;
  }
  for (const term of PRICE_TERMS) {
    if (needleInWords(reply, replyWords, term) && !needleInWords(card, cardWords, term)) return true;
  }
  return false;
}

function extraInstruction(reply: string, card: string, replyWords: readonly string[], cardWords: readonly string[]): boolean {
  for (const group of INSTRUCTION_GROUPS) {
    if (group.some((n) => needleInWords(reply, replyWords, n)) && !group.some((n) => needleInWords(card, cardWords, n))) {
      return true;
    }
  }
  return false;
}

function extraPermission(reply: string, card: string, replyWords: readonly string[], cardWords: readonly string[]): boolean {
  for (const p of PERMISSION_TH) {
    if (thaiPhrasePresent(replyWords, p) && !thaiPhrasePresent(cardWords, p)) return true;
  }
  for (const p of PERMISSION_EN) {
    if (englishWord(reply, p) && !englishWord(card, p)) return true;
  }
  return false;
}

function uncoveredContent(reply: string, cardSet: Set<string>): boolean {
  const nums = extractNumberSpans(reply);
  const words = wordSpans(reply);
  const list = words.map((w) => w.word);
  for (let i = 0; i < words.length; i++) {
    const span = words[i]!;
    if (insideSpan(span.start, span.end, nums)) continue;
    if (parseNumberToken(span.word) != null) continue;
    const w = normWord(span.word);
    if (cardSet.has(w)) continue;
    if (allowCovers(list, i)) continue;
    return true;
  }
  return false;
}

function extraNumbers(reply: string, card: string): boolean {
  const allowed = new Set(numberValues(card));
  for (const v of numberValues(reply)) {
    if (!allowed.has(v)) return true;
  }
  return false;
}

/** Failed fact-check reasons (empty = accept). Add-only; never logs text. */
export function chatFactCheckFailures(reply: string | null | undefined, cardText: string | null | undefined): FactCheckReason[] {
  const raw = nfc(reply == null ? "" : String(reply));
  const card = nfc(cardText == null ? "" : String(cardText));
  if (!raw.trim()) return [];
  if (!hasWordSegmenter()) return ["coverage"];
  const fails: FactCheckReason[] = [];
  const replyWords = wordSpans(raw).map((w) => w.word);
  const cardWords = wordSpans(card).map((w) => w.word);
  const cardSet = cardWordSet(card);
  if (extraNumbers(raw, card)) fails.push("quantity");
  if (uncoveredContent(raw, cardSet)) fails.push("coverage");
  if (extraQuantities(raw, card, replyWords, cardWords) && !fails.includes("quantity")) fails.push("quantity");
  if (extraInstruction(raw, card, replyWords, cardWords)) fails.push("instruction");
  if (extraPermission(raw, card, replyWords, cardWords)) fails.push("permission");
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
