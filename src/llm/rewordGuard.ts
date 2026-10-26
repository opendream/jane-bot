import type { BankCard } from "../core/bank";
import { phonesIn, hoursIn, urlsIn, hostOf, toArabic } from "../core/bank";
import { detectCrisis } from "../core/crisis";
import { stripPII } from "../core/summary";
import { findPhrases } from "../core/text";
import { GUARD_RULES } from "../core/guard";

/* ------------------------------------------------------------------------------------------
 * Reword validator (build plan v2 §4.1). Fail closed: a reword is shown only if it provably
 * keeps the meaning (same content words, same negation attachments, same number-unit-comparator
 * sequence). Anything unsure, including a missing Intl.Segmenter, falls back to answer_th.
 * Never logs text.
 * ---------------------------------------------------------------------------------------- */

export type RewordCheck =
  | "empty" | "think" | "facts" | "numbers" | "phones" | "links" | "hours" | "medical_claims" | "negation"
  | "length" | "paragraph" | "banned" | "english_only" | "placeholder" | "crisis" | "pii" | "words";

export interface RewordContext {
  phones: ReadonlySet<string>;
  linkHosts: ReadonlySet<string>;
  /** Service handles already public in services.json (e.g. "@teen_club"). */
  handles: ReadonlySet<string>;
}

export const LENGTH = { min: 0.6, max: 1.4, hardCap: 450 } as const;

/** Tone / particle words that may be added. Anything else in the reword must already be in the card. */
export const PARTICLES: readonly string[] = ["นะ", "ค่ะ", "คะ", "จ้ะ", "เลย", "ก็", "แล้ว"];

/** New medical claims: drug names, dose units, cure/certainty claims, diagnosis words. DRAFT, Thai review pending. */
export const MEDICAL_LEXICON: readonly string[] = [
  "postinor", "โพสตินอร์", "levonorgestrel", "เลโวนอร์เจสเตรล", "ulipristal", "mifepristone", "ไมเฟพริสโตน", "misoprostol", "ไมโซพรอสทอล",
  "cytotec", "ไซโตเทค", "antibiotic", "ยาปฏิชีวนะ", "ยาแก้อักเสบ", "ยาฆ่าเชื้อ", "ยาต้านไวรัส", "พาราเซตามอล", "ibuprofen", "ไอบูโพรเฟน",
  "ยาสตรี", "ยาขับ", "ฮอร์โมน",
  "mg", "มก.", "มิลลิกรัม", "เม็ด", "ml", "มล.", "มิลลิลิตร", "cc", "ซีซี", "ไมโครกรัม",
  "รักษาหาย", "หายขาด", "หายแน่นอน", "100%", "๑๐๐%", "ร้อยเปอร์เซ็นต์", "ไม่ต้องไปหาหมอ", "ไม่ต้องพบแพทย์", "ไม่ต้องไปโรงพยาบาล",
  "ปลอดภัยแน่นอน", "ไม่มีผลข้างเคียง", "การันตี", "รับประกัน", "ได้ผลแน่นอน", "ไม่ท้องแน่นอน", "ไม่ติดแน่นอน",
  "วินิจฉัย", "คุณเป็นโรค", "คุณติดเชื้อ", "คุณท้องแล้ว", "คุณไม่ได้ท้อง", "เป็นมะเร็ง", "แน่นอนว่าเป็น", "อาการนี้คือ",
];

/** Banned output (explicit, roleplay framing, judging, method/dosing instructions). DRAFT. */
export const BANNED_OUTPUT: readonly string[] = [
  "เย็ด", "เงี่ยน", "ควย", "หี", "ช่วยตัวเอง", "อมควย", "เลียหี", "porn", "หนังโป๊", "คลิปโป๊",
  "ในฐานะแฟน", "ที่รักจ๋า", "สมมติว่าพี่เป็น", "*กอด*", "*จุ๊บ*", "รักนะ", "คิดถึงนะ",
  "น่าอาย", "ผิดศีลธรรม", "สมควรแล้ว", "สมน้ำหน้า", "โง่", "มั่ว", "ใจแตก", "ไม่รักนวลสงวนตัว", "เด็กไม่ดี",
  ...GUARD_RULES.abortion_method, ...GUARD_RULES.dosing, "กินครั้งละ", "วันละ", "สอดยา", "เหน็บยา",
];
const CRISIS_RANK = { none: 0, banner: 1, override: 2 } as const;
const PARTICLE_SET = new Set(PARTICLES);
const ONES: Record<string, number> = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
const TENS: Record<string, number> = { ยี่สิบ: 20, สามสิบ: 30, สี่สิบ: 40, ห้าสิบ: 50, หกสิบ: 60, เจ็ดสิบ: 70, แปดสิบ: 80, เก้าสิบ: 90 };
const SCALES: Record<string, number> = { ร้อย: 100, พัน: 1000, หมื่น: 10_000, แสน: 100_000, ล้าน: 1_000_000 };
const NUM_WORDS = new Set([...Object.keys(ONES), ...Object.keys(TENS), ...Object.keys(SCALES), "สิบ", "ครึ่ง"]);
const UNITS = ["เปอร์เซ็นต์", "ชั่วโมง", "สัปดาห์", "เดือน", "นาที", "ครั้ง", "เม็ด", "วัน", "ปี", "ชม.", "ชม", "%", "％"];
const UNIT_SET = new Set(UNITS);
const COMP_ONE = new Set(["เกิน", "ภายใน", "ก่อน", "หลัง"]);
const NEG_ONE = new Set(["ไม่", "ห้าม", "อย่า", "มิ", "ปฏิเสธ"]);

type Kind = "neg" | "comp" | "num" | "unit" | "particle" | "content";
interface Atom { kind: Kind; text: string; value?: string }

const nfc = (s: string) => s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
const sameSet = (a: Iterable<string>, b: Iterable<string>) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every((x) => B.has(x)); };
function contacts(s: string): string[] {
  return [...urlsIn(s).map((u) => u.toLowerCase()), ...(s.match(/@[\w.\-]{2,}/g) ?? []).map((x) => x.toLowerCase()),
    ...[...s.matchAll(/(?:line\s*(?:id)?|ไลน์\s*(?:ไอดี)?|ไอดีไลน์)\s*[:：]?\s*(?!@)([a-z0-9._-]{3,})/gi)].map((m) => `line:${m[1].toLowerCase()}`)];
}
const thaiRatio = (s: string) => { const letters = s.match(/[\p{L}]/gu) ?? []; return letters.length ? letters.filter((c) => /[\u0E00-\u0E7F]/.test(c)).length / letters.length : 0; };

function splitNegPrefix(w: string): string[] {
  if (w.startsWith("ไม่") && w.length > 2) return ["ไม่", w.slice(2)];
  if (w.startsWith("มิ") && w.length > 1 && w !== "มิ") return ["มิ", w.slice(1)];
  return [w];
}

function explode(tok: string): string[] {
  const t = toArabic(nfc(tok));
  const parts = t.split(/(\d+|[%％])/).filter((p) => p && p.trim());
  const out: string[] = [];
  for (const p of parts) {
    const unit = UNITS.find((u) => u !== "%" && u !== "％" && p.endsWith(u) && p.length > u.length);
    if (unit) {
      const head = p.slice(0, p.length - unit.length);
      if (head) out.push(...explode(head));
      out.push(unit);
    } else out.push(...splitNegPrefix(p));
  }
  return out.length ? out : splitNegPrefix(tok);
}

/** Word tokens, or null if segmentation is unavailable / throws (caller must fail closed). */
export function tokenize(text: string): string[] | null {
  try {
    if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
    const seg = new Intl.Segmenter("th", { granularity: "word" });
    const out: string[] = [];
    for (const s of seg.segment(nfc(text))) {
      const piece = s.segment;
      if (s.isWordLike || /^[%％]$/.test(piece.trim())) out.push(...explode(piece));
    }
    return out.filter((w) => w.trim());
  } catch {
    return null;
  }
}

function isDigitTok(w: string) { return /^\d+$/.test(toArabic(w)); }
function isNumWord(w: string) { return NUM_WORDS.has(w); }
function isNumberTok(w: string) { return isDigitTok(w) || isNumWord(w); }

function thaiToInt(toks: string[]): number | null {
  let total = 0, current = 0;
  for (const raw of toks) {
    const t = toArabic(raw);
    if (/^\d+$/.test(t)) { current += Number(t); continue; }
    if (raw === "ครึ่ง") return null;
    if (ONES[raw] != null) {
      if (current >= 10 && current % 10 === 0) current += ONES[raw];
      else current += ONES[raw];
      continue;
    }
    if (raw === "สิบ") { current = current === 0 ? 10 : current * 10; continue; }
    if (TENS[raw] != null) { current += TENS[raw]; continue; }
    if (SCALES[raw] != null) {
      if (current === 0) current = 1;
      total += current * SCALES[raw];
      current = 0;
      continue;
    }
    return null;
  }
  return total + current;
}

function numberValue(toks: string[]): string {
  if (toks.length === 1 && toks[0] === "ครึ่ง") return "1/2";
  if (toks.every((t) => isDigitTok(t))) return toks.map((t) => toArabic(t)).join("");
  const n = thaiToInt(toks);
  return n == null ? toks.map((t) => toArabic(t)).join("") : String(n);
}

function atoms(words: string[]): Atom[] {
  const out: Atom[] = [];
  for (let i = 0; i < words.length; ) {
    const w = words[i], n = words[i + 1];
    if (w === "ไม่" && n === "ถึง") { out.push({ kind: "comp", text: "ไม่ถึง" }); i += 2; continue; }
    if (w === "ไม่" && n === "ได้") { out.push({ kind: "neg", text: "ไม่ได้" }); i += 2; continue; }
    if (w === "ไม่" && n === "ต้อง") { out.push({ kind: "neg", text: "ไม่ต้อง" }); i += 2; continue; }
    if (w === "มิ" && n === "ได้") { out.push({ kind: "neg", text: "มิได้" }); i += 2; continue; }
    if (COMP_ONE.has(w)) { out.push({ kind: "comp", text: w }); i += 1; continue; }
    if (NEG_ONE.has(w)) { out.push({ kind: "neg", text: w }); i += 1; continue; }
    if (isNumberTok(w)) {
      const run = [w];
      i += 1;
      while (i < words.length && isNumberTok(words[i])) { run.push(words[i]); i += 1; }
      out.push({ kind: "num", text: run.join(""), value: numberValue(run) });
      continue;
    }
    if (UNIT_SET.has(w)) { out.push({ kind: "unit", text: w === "％" ? "%" : w }); i += 1; continue; }
    if (PARTICLE_SET.has(w)) { out.push({ kind: "particle", text: w }); i += 1; continue; }
    out.push({ kind: "content", text: w });
    i += 1;
  }
  return out;
}

function numberRecords(a: Atom[]): string[] {
  const rec: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].kind !== "num") continue;
    let unit = "", comp = "";
    for (let j = i + 1; j <= i + 2 && j < a.length; j++) if (a[j].kind === "unit") { unit = a[j].text; break; }
    for (let j = i - 1; j >= i - 2 && j >= 0; j--) if (a[j].kind === "comp") { comp = a[j].text; break; }
    rec.push(`${a[i].value ?? a[i].text}|${unit}|${comp}`);
  }
  return rec;
}

function negationRecords(a: Atom[]): string[] {
  const rec: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].kind !== "neg") continue;
    let nb = "";
    for (let j = i - 1; j >= 0; j--) if (a[j].kind === "content") { nb = a[j].text; break; }
    if (!nb) for (let j = i + 1; j < a.length; j++) if (a[j].kind === "content") { nb = a[j].text; break; }
    rec.push(`${a[i].text}|${nb}`);
  }
  return rec;
}

function sameSeq(a: string[], b: string[]) { return a.length === b.length && a.every((x, i) => x === b[i]); }

/** All failed checks for a reworded `output` of `card` (empty array = accept). */
export function rewordFailures(card: BankCard, output: string | null | undefined, ctx: RewordContext): RewordCheck[] {
  const fails = new Set<RewordCheck>();
  const canon = nfc(card.answer_th);
  const raw = output == null ? "" : nfc(String(output));
  const out = raw.trim();
  if (!out) return ["empty"];
  if (/<\/?think>|\/no_think|<\|im_(start|end)\|>/i.test(raw)) fails.add("think");

  const origTok = tokenize(canon);
  const outTok = tokenize(out);
  if (!origTok || !outTok) fails.add("words");
  else {
    const origSet = new Set(origTok.map((w) => toArabic(w)));
    const extra = outTok.filter((w) => !PARTICLE_SET.has(w) && !origSet.has(toArabic(w)));
    if (extra.length) fails.add("words");
    const oa = atoms(origTok), ua = atoms(outTok);
    if (!sameSeq(negationRecords(oa), negationRecords(ua))) fails.add("negation");
    if (!sameSeq(numberRecords(oa), numberRecords(ua))) fails.add("numbers");
  }

  for (const f of card.key_facts) if (!out.includes(nfc(f))) fails.add("facts");
  const ph = phonesIn(out);
  if (!sameSet(ph, phonesIn(canon)) || ph.some((p) => !ctx.phones.has(p))) fails.add("phones");
  const cs = contacts(out);
  const okContact = (c: string) => (c.startsWith("@") ? ctx.handles.has(c) || [...ctx.handles].some((h) => h.toLowerCase() === c) : c.startsWith("line:") ? false : ctx.linkHosts.has(hostOf(c)));
  if (!sameSet(cs, contacts(canon)) || cs.some((c) => !okContact(c))) fails.add("links");
  if (!sameSet(hoursIn(out), hoursIn(canon))) fails.add("hours");
  const lower = (s: string) => s.toLowerCase();
  for (const term of MEDICAL_LEXICON) if (lower(out).includes(lower(term)) && !lower(canon).includes(lower(term))) { fails.add("medical_claims"); break; }
  if (out.length < canon.length * LENGTH.min || out.length > canon.length * LENGTH.max || out.length > LENGTH.hardCap) fails.add("length");
  if (/\n/.test(out)) fails.add("paragraph");
  if (findPhrases(out, BANNED_OUTPUT).some((b) => !findPhrases(canon, [b]).length)) fails.add("banned");
  if (thaiRatio(out) < 0.5) fails.add("english_only");
  if (canon.includes("PLACEHOLDER") && !out.includes("PLACEHOLDER")) fails.add("placeholder");
  if (CRISIS_RANK[detectCrisis(out).level] > CRISIS_RANK[detectCrisis(canon).level]) fails.add("crisis");
  let masked = out;
  for (const hnd of ctx.handles) masked = masked.split(hnd).join("");
  if (stripPII(masked) !== masked.replace(/\s+/g, " ").trim()) fails.add("pii");
  return [...fails];
}

/** Accept the reworded text, or fall back to the exact curated text. */
export function acceptReword(card: BankCard, output: string | null | undefined, ctx: RewordContext): { text: string; reworded: boolean; failures: RewordCheck[] } {
  if (!card.reword) return { text: card.answer_th, reworded: false, failures: [] };
  const failures = rewordFailures(card, output, ctx);
  const clean = output == null ? "" : nfc(String(output)).trim();
  if (failures.length || clean === nfc(card.answer_th)) return { text: card.answer_th, reworded: false, failures };
  return { text: clean, reworded: true, failures };
}
