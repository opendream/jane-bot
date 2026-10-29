/**
 * Thai/English word segmentation for grounded chat (Intl.Segmenter).
 * Used by the sentence-level faithfulness check (whole-token numbers and
 * polarity) and by trim's "meaningful sentence" bar. No new dependency.
 * Fail closed if Segmenter is missing. Never logs text.
 */

export const MIN_CONTENT_WORDS = 2;

export interface WordSpan {
  word: string;
  start: number;
  end: number;
}

export interface NumberSpan {
  start: number;
  end: number;
  value: number;
}

function nfc(s: string): string {
  return s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

export { nfc as nfcText };

let cached: Intl.Segmenter | null | undefined;

export function hasWordSegmenter(): boolean {
  return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
}

function segmenter(): Intl.Segmenter | null {
  if (cached !== undefined) return cached;
  cached = hasWordSegmenter() ? new Intl.Segmenter("th", { granularity: "word" }) : null;
  return cached;
}

export function normWord(word: string): string {
  return nfc(word).toLowerCase();
}

/** Word-like spans (punctuation / whitespace dropped). Empty if Segmenter is missing. */
export function wordSpans(text: string): WordSpan[] {
  const seg = segmenter();
  const raw = nfc(text ?? "");
  if (!seg || !raw) return [];
  const out: WordSpan[] = [];
  for (const part of seg.segment(raw)) {
    if (!part.isWordLike) continue;
    const word = part.segment;
    if (!/\p{L}|\p{N}/u.test(word)) continue;
    out.push({ word, start: part.index, end: part.index + word.length });
  }
  return out;
}

export function wordList(text: string): string[] {
  return wordSpans(text).map((w) => w.word);
}

const THAI_DIGIT: Record<string, string> = {
  "๐": "0", "๑": "1", "๒": "2", "๓": "3", "๔": "4",
  "๕": "5", "๖": "6", "๗": "7", "๘": "8", "๙": "9",
};

const THAI_ONES: Record<string, number> = {
  หนึ่ง: 1, เอ็ด: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9,
};

const THAI_TENS: Record<string, number> = {
  สิบ: 10, ยี่สิบ: 20, สามสิบ: 30, สี่สิบ: 40, ห้าสิบ: 50,
  หกสิบ: 60, เจ็ดสิบ: 70, แปดสิบ: 80, เก้าสิบ: 90,
};

const EN_NUMS: ReadonlyArray<readonly [string, number]> = [
  ["nineteen", 19], ["eighteen", 18], ["seventeen", 17], ["sixteen", 16],
  ["fifteen", 15], ["fourteen", 14], ["thirteen", 13], ["thirty", 30],
  ["twelve", 12], ["eleven", 11], ["thousand", 1000], ["hundred", 100],
  ["ninety", 90], ["eighty", 80], ["seventy", 70], ["sixty", 60],
  ["fifty", 50], ["forty", 40], ["twenty", 20], ["ten", 10],
  ["nine", 9], ["eight", 8], ["seven", 7], ["six", 6], ["five", 5],
  ["four", 4], ["three", 3], ["two", 2], ["one", 1], ["half", 0.5],
];

function parseDigitRun(raw: string): number | null {
  let s = "";
  for (const c of raw) s += THAI_DIGIT[c] ?? c;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseThaiNumberWord(w: string): number | null {
  if (w === "ครึ่ง") return 0.5;
  if (w === "ร้อย") return 100;
  if (w === "พัน") return 1000;
  if (w in THAI_ONES) return THAI_ONES[w]!;
  if (w in THAI_TENS) return THAI_TENS[w]!;
  const tens = Object.entries(THAI_TENS).sort((a, b) => b[0].length - a[0].length);
  for (const [tok, tv] of tens) {
    if (!w.startsWith(tok) || w.length === tok.length) continue;
    const rest = w.slice(tok.length);
    if (rest in THAI_ONES) return tv + THAI_ONES[rest]!;
  }
  return null;
}

const EN_NUM_MAP = new Map(EN_NUMS.map(([tok, val]) => [tok, val]));

function parseEnNumberWord(w: string): number | null {
  return EN_NUM_MAP.get(w.toLowerCase()) ?? null;
}

function parseFractionToken(w: string): number | null {
  const m = nfc(w).match(/^(.+?)(?:ใน|in)(.+)$/i);
  if (!m) return null;
  const a = parseThaiNumberWord(m[1]!) ?? parseDigitRun(m[1]!) ?? parseEnNumberWord(m[1]!);
  const b = parseThaiNumberWord(m[2]!) ?? parseDigitRun(m[2]!) ?? parseEnNumberWord(m[2]!);
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

function isListMarker(text: string, start: number, end: number): boolean {
  let i = start - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
  if (i >= 0 && text[i] !== "\n") return false;
  if (text[end] !== ".") return false;
  const after = text[end + 1];
  return after == null || /\s/.test(after);
}

function overlaps(a: NumberSpan, start: number, end: number): boolean {
  return start < a.end && end > a.start;
}

/**
 * Number values in `text` as whole tokens only (Intl.Segmenter), never as a
 * substring inside สามารถ / เสี่ยง / ห้าม / เพศสัมพันธ์. Digits, Thai digits,
 * Thai/English number words, and fractions like สามในสี่. List markers
 * ("1. …") are skipped so a card's numbered list does not license 1, 2, …
 */
export function extractNumberSpans(text: string): NumberSpan[] {
  const raw = nfc(text ?? "");
  const spans: NumberSpan[] = [];
  const take = (start: number, end: number, value: number) => {
    if (spans.some((s) => overlaps(s, start, end))) return;
    spans.push({ start, end, value });
  };
  const words = wordSpans(raw);

  for (let i = 0; i + 2 < words.length; i++) {
    const a = words[i]!;
    const mid = words[i + 1]!;
    const b = words[i + 2]!;
    const midW = normWord(mid.word);
    if (midW !== "ใน" && midW !== "in") continue;
    const av = parseThaiNumberWord(a.word) ?? parseDigitRun(a.word) ?? parseEnNumberWord(a.word);
    const bv = parseThaiNumberWord(b.word) ?? parseDigitRun(b.word) ?? parseEnNumberWord(b.word);
    if (av == null || bv == null || bv === 0) continue;
    take(a.start, b.end, av / bv);
  }

  // Compound Thai numbers that Segmenter splits (สิบ+เก้า → 19), never
  // substrings inside สามารถ / เสี่ยง / ห้าม / เพศสัมพันธ์.
  let i = 0;
  while (i < words.length) {
    const start = i;
    while (i < words.length && parseThaiNumberWord(words[i]!.word) != null) i++;
    if (i > start) {
      const run = words.slice(start, i);
      const joined = run.map((w) => w.word).join("");
      const compound = parseThaiNumberWord(joined);
      if (compound != null) {
        if (!isListMarker(raw, run[0]!.start, run[run.length - 1]!.end)) {
          take(run[0]!.start, run[run.length - 1]!.end, compound);
        }
      } else {
        for (const w of run) {
          const val = parseThaiNumberWord(w.word);
          if (val == null || isListMarker(raw, w.start, w.end)) continue;
          take(w.start, w.end, val);
        }
      }
      continue;
    }
    i++;
  }

  for (const w of words) {
    if (isListMarker(raw, w.start, w.end)) continue;
    const val = parseDigitRun(w.word) ?? parseEnNumberWord(w.word) ?? parseFractionToken(w.word);
    if (val == null) continue;
    take(w.start, w.end, val);
  }
  return spans;
}

export function numberValues(text: string): number[] {
  return [...new Set(extractNumberSpans(text).map((s) => s.value))];
}

function isParticleWord(word: string, particles: readonly string[]): boolean {
  const w = nfc(word);
  if (/^า+$/u.test(w)) return true;
  if (particles.some((p) => p === w)) return true;
  if ((w.startsWith("จ้า") || w.startsWith("น้า")) && /^[จ้าน้า]า+$/u.test(w)) return true;
  return false;
}

/** Non-particle letter/number words. Used by trim's complete-sentence bar. */
export function contentWordCount(text: string, particles: readonly string[]): number {
  let n = 0;
  for (const span of wordSpans(text)) {
    if (isParticleWord(span.word, particles)) continue;
    n += 1;
  }
  return n;
}

export function insideSpan(start: number, end: number, spans: readonly NumberSpan[]): boolean {
  return spans.some((s) => start >= s.start && end <= s.end);
}

export function parseNumberToken(word: string): number | null {
  const w = nfc(word);
  return parseFractionToken(w) ?? parseThaiNumberWord(w) ?? parseDigitRun(w) ?? parseEnNumberWord(w);
}
