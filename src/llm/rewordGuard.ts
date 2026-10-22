import type { BankCard } from "../core/bank";
import { phonesIn, hoursIn, urlsIn, hostOf, toArabic } from "../core/bank";
import { detectCrisis } from "../core/crisis";
import { stripPII } from "../core/summary";
import { findPhrases } from "../core/text";
import { GUARD_RULES } from "../core/guard";

/* ------------------------------------------------------------------------------------------
 * Reword validator (build plan v2 §4.1), generalising acceptPolished() in adapter.ts.
 * The model's reworded card text is shown ONLY if every check passes; otherwise the exact
 * curated answer_th is shown. Pure and synchronous; never logs text.
 * ---------------------------------------------------------------------------------------- */

export type RewordCheck =
  | "empty" | "think" | "facts" | "numbers" | "phones" | "links" | "hours" | "medical_claims" | "negation"
  | "length" | "paragraph" | "banned" | "english_only" | "placeholder" | "crisis" | "pii";

export interface RewordContext {
  phones: ReadonlySet<string>;
  linkHosts: ReadonlySet<string>;
  /** Service handles already public in services.json (e.g. "@teen_club"). */
  handles: ReadonlySet<string>;
}

export const LENGTH = { min: 0.6, max: 1.4, hardCap: 450 } as const;

/** New medical claims: drug names, dose units, cure/certainty claims, diagnosis words. DRAFT, Thai review pending. */
export const MEDICAL_LEXICON: readonly string[] = [
  // drugs and products
  "postinor", "โพสตินอร์", "levonorgestrel", "เลโวนอร์เจสเตรล", "ulipristal", "mifepristone", "ไมเฟพริสโตน", "misoprostol", "ไมโซพรอสทอล",
  "cytotec", "ไซโตเทค", "antibiotic", "ยาปฏิชีวนะ", "ยาแก้อักเสบ", "ยาฆ่าเชื้อ", "ยาต้านไวรัส", "พาราเซตามอล", "ibuprofen", "ไอบูโพรเฟน",
  "ยาสตรี", "ยาขับ", "ฮอร์โมน",
  // dose units
  "mg", "มก.", "มิลลิกรัม", "เม็ด", "ml", "มล.", "มิลลิลิตร", "cc", "ซีซี", "ไมโครกรัม",
  // certainty and cure claims
  "รักษาหาย", "หายขาด", "หายแน่นอน", "100%", "๑๐๐%", "ร้อยเปอร์เซ็นต์", "ไม่ต้องไปหาหมอ", "ไม่ต้องพบแพทย์", "ไม่ต้องไปโรงพยาบาล",
  "ปลอดภัยแน่นอน", "ไม่มีผลข้างเคียง", "การันตี", "รับประกัน", "ได้ผลแน่นอน", "ไม่ท้องแน่นอน", "ไม่ติดแน่นอน",
  // diagnosis
  "วินิจฉัย", "คุณเป็นโรค", "คุณติดเชื้อ", "คุณท้องแล้ว", "คุณไม่ได้ท้อง", "เป็นมะเร็ง", "แน่นอนว่าเป็น", "อาการนี้คือ",
];

/** Banned output (explicit, roleplay framing, judging, method/dosing instructions). DRAFT. */
export const BANNED_OUTPUT: readonly string[] = [
  // explicit sexual terms
  "เย็ด", "เงี่ยน", "ควย", "หี", "ช่วยตัวเอง", "อมควย", "เลียหี", "porn", "หนังโป๊", "คลิปโป๊",
  // roleplay framing and companion hooks
  "ในฐานะแฟน", "ที่รักจ๋า", "สมมติว่าพี่เป็น", "*กอด*", "*จุ๊บ*", "รักนะ", "คิดถึงนะ",
  // judging words
  "น่าอาย", "ผิดศีลธรรม", "สมควรแล้ว", "สมน้ำหน้า", "โง่", "มั่ว", "ใจแตก", "ไม่รักนวลสงวนตัว", "เด็กไม่ดี",
  // method and dosing instructions
  ...GUARD_RULES.abortion_method, ...GUARD_RULES.dosing, "กินครั้งละ", "วันละ", "สอดยา", "เหน็บยา",
];
const NEGATIONS = ["ไม่", "ห้าม", "อย่า", "มิได้", "ไม่ได้", "not ", "don't", "never"];
const CRISIS_RANK = { none: 0, banner: 1, override: 2 } as const;

const nfc = (s: string) => s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
const digitRuns = (s: string) => (toArabic(s).match(/\d+/g) ?? []).sort();
const sameMultiset = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: Iterable<string>, b: Iterable<string>) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every((x) => B.has(x)); };
/** URLs, @handles and bare LINE ids (an @handle after "ไลน์" is checked as a handle). */
function contacts(s: string): string[] {
  return [...urlsIn(s).map((u) => u.toLowerCase()), ...(s.match(/@[\w.\-]{2,}/g) ?? []).map((x) => x.toLowerCase()),
    ...[...s.matchAll(/(?:line\s*(?:id)?|ไลน์\s*(?:ไอดี)?|ไอดีไลน์)\s*[:：]?\s*(?!@)([a-z0-9._-]{3,})/gi)].map((m) => `line:${m[1].toLowerCase()}`)];
}
const thaiRatio = (s: string) => { const letters = s.match(/[\p{L}]/gu) ?? []; return letters.length ? letters.filter((c) => /[\u0E00-\u0E7F]/.test(c)).length / letters.length : 0; };

/** Negation tokens in the few characters before each key fact. */
function negationsNear(text: string, fact: string, window = 12): number {
  let n = 0, from = 0, i: number;
  while ((i = text.indexOf(fact, from)) >= 0) {
    const before = text.slice(Math.max(0, i - window), i);
    n += NEGATIONS.filter((t) => before.includes(t)).length;
    from = i + fact.length;
  }
  return n;
}

/** All failed checks for a reworded `output` of `card` (empty array = accept). */
export function rewordFailures(card: BankCard, output: string | null | undefined, ctx: RewordContext): RewordCheck[] {
  const fails = new Set<RewordCheck>();
  const canon = nfc(card.answer_th);
  const raw = output == null ? "" : nfc(String(output));
  const out = raw.trim();
  if (!out) return ["empty"];
  if (/<\/?think>|\/no_think|<\|im_(start|end)\|>/i.test(raw)) fails.add("think");
  // Facts, numbers, phones, links, hours.
  for (const f of card.key_facts) if (!out.includes(nfc(f))) fails.add("facts");
  if (!sameMultiset(digitRuns(out), digitRuns(canon))) fails.add("numbers");
  const ph = phonesIn(out);
  if (!sameSet(ph, phonesIn(canon)) || ph.some((p) => !ctx.phones.has(p))) fails.add("phones");
  const cs = contacts(out);
  const okContact = (c: string) => (c.startsWith("@") ? ctx.handles.has(c) || [...ctx.handles].some((h) => h.toLowerCase() === c) : c.startsWith("line:") ? false : ctx.linkHosts.has(hostOf(c)));
  if (!sameSet(cs, contacts(canon)) || cs.some((c) => !okContact(c))) fails.add("links");
  if (!sameSet(hoursIn(out), hoursIn(canon))) fails.add("hours");
  // No new medical claims; no new negation next to a key fact.
  const lower = (s: string) => s.toLowerCase();
  for (const term of MEDICAL_LEXICON) if (lower(out).includes(lower(term)) && !lower(canon).includes(lower(term))) { fails.add("medical_claims"); break; }
  for (const f of card.key_facts) if (negationsNear(out, nfc(f)) > negationsNear(canon, nfc(f))) fails.add("negation");
  // Length and shape.
  if (out.length < canon.length * LENGTH.min || out.length > canon.length * LENGTH.max || out.length > LENGTH.hardCap) fails.add("length");
  if (/\n/.test(out)) fails.add("paragraph");
  // Banned content.
  if (findPhrases(out, BANNED_OUTPUT).some((b) => !findPhrases(canon, [b]).length)) fails.add("banned");
  if (thaiRatio(out) < 0.5) fails.add("english_only");
  if (canon.includes("PLACEHOLDER") && !out.includes("PLACEHOLDER")) fails.add("placeholder");
  // Crisis level must not rise.
  if (CRISIS_RANK[detectCrisis(out).level] > CRISIS_RANK[detectCrisis(canon).level]) fails.add("crisis");
  // PII: stripPII must leave it unchanged (public service handles masked first).
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
