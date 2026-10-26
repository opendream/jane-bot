import type { BankCard } from "../core/bank";

/* ------------------------------------------------------------------------------------------
 * Reword validator (build plan v2 §4.1). Particle-only by construction: a reword is shown
 * only if it is the card's original text (Unicode NFC + whitespace normalisation) with
 * allowed tone particles inserted at clause or sentence ends. Anything else, including a
 * missing Intl.Segmenter, falls back to answer_th. Never logs text.
 * ---------------------------------------------------------------------------------------- */

export type RewordCheck = "empty" | "think" | "particles";

export interface RewordContext {
  phones: ReadonlySet<string>;
  linkHosts: ReadonlySet<string>;
  /** Service handles already public in services.json (e.g. "@teen_club"). */
  handles: ReadonlySet<string>;
}

/** Tone / particle words that may be inserted at clause or sentence ends, at most 2 per sentence. */
export const PARTICLES: readonly string[] = ["นะ", "ค่ะ", "คะ", "จ้ะ", "เลย", "ก็", "แล้ว"];
const PARTICLE_MATCH = [...PARTICLES].sort((a, b) => b.length - a.length);

const nfc = (s: string) => s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
const ws = (s: string) => nfc(s).replace(/\s+/g, " ").trim();
const isSpace = (ch: string) => /\s/.test(ch);
const isPunct = (ch: string) => /[.,!?。？！ฯ;:…"'""''）)\]】》]/.test(ch);
const isClauseEnd = (s: string, i: number) => i >= s.length || isSpace(s[i]) || isPunct(s[i]);
const isSentenceEndChar = (ch: string) => /[.!?。？！]/.test(ch);

function wordStarts(text: string): Set<number> | null {
  try {
    if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
    const starts = new Set<number>();
    for (const s of new Intl.Segmenter("th", { granularity: "word" }).segment(text)) {
      if (s.isWordLike) starts.add(s.index);
    }
    return starts;
  } catch {
    return null;
  }
}

function matchParticle(s: string, i: number): string | null {
  for (const p of PARTICLE_MATCH) if (s.startsWith(p, i)) return p;
  return null;
}

/** Consume an extra particle at a Segmenter word boundary, plus whitespace/punct next to it. */
function tryConsumeParticle(out: string, j: number, starts: Set<number>): number | null {
  let k = j;
  while (k < out.length && isSpace(out[k])) k++;
  const p = matchParticle(out, k);
  if (!p || !starts.has(k)) return null;
  k += p.length;
  while (k < out.length && isPunct(out[k])) k++;
  return k === j ? null : k;
}

/** True iff `out` is `orig` plus clause-end particles (≤ 2 per sentence). */
function particleOnly(origRaw: string, outRaw: string): boolean {
  const orig = ws(origRaw);
  const out = ws(outRaw);
  const starts = wordStarts(out);
  if (!starts) return false;
  let i = 0, j = 0, inSentence = 0;
  while (i < orig.length || j < out.length) {
    if (isClauseEnd(orig, i)) {
      while (true) {
        const next = tryConsumeParticle(out, j, starts);
        if (next == null) break;
        inSentence += 1;
        if (inSentence > 2) return false;
        j = next;
      }
    }
    if (i >= orig.length && j >= out.length) return true;
    if (i < orig.length && j < out.length && orig[i] === out[j]) {
      if (isSentenceEndChar(orig[i])) inSentence = 0;
      i += 1;
      j += 1;
      continue;
    }
    return false;
  }
  return true;
}

/** All failed checks for a reworded `output` of `card` (empty array = accept). */
export function rewordFailures(card: BankCard, output: string | null | undefined, _ctx: RewordContext): RewordCheck[] {
  const fails: RewordCheck[] = [];
  const canon = nfc(card.answer_th);
  const raw = output == null ? "" : nfc(String(output));
  const out = raw.trim();
  if (!out) return ["empty"];
  if (/<\/?think>|\/no_think|<\|im_(start|end)\|>/i.test(raw)) fails.push("think");
  if (!particleOnly(canon, out)) fails.push("particles");
  return fails;
}

/** Accept the reworded text, or fall back to the exact curated text. */
export function acceptReword(card: BankCard, output: string | null | undefined, ctx: RewordContext): { text: string; reworded: boolean; failures: RewordCheck[] } {
  if (!card.reword) return { text: card.answer_th, reworded: false, failures: [] };
  const failures = rewordFailures(card, output, ctx);
  const clean = output == null ? "" : nfc(String(output)).trim();
  if (failures.length || ws(clean) === ws(card.answer_th)) return { text: card.answer_th, reworded: false, failures };
  return { text: clean, reworded: true, failures };
}
