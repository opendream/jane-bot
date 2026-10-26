import type { BankCard } from "../core/bank";

/* ------------------------------------------------------------------------------------------
 * Reword validator (build plan v2 §4.1). Particle-only by construction: after NFC and
 * trailing-whitespace trim, a reword is shown only if it equals the exact card text, or
 * the exact card text followed directly by exactly one of นะ, ค่ะ, จ้ะ (at most one
 * optional space before it) and nothing after. If the card already ends with punctuation
 * or a line break, only the exact text passes. At most one added particle, only at the
 * end of the card. Anything else falls back to answer_th. Never logs text.
 * ---------------------------------------------------------------------------------------- */

export type RewordCheck = "empty" | "think" | "particles";

export interface RewordContext {
  phones: ReadonlySet<string>;
  linkHosts: ReadonlySet<string>;
  /** Service handles already public in services.json (e.g. "@teen_club"). */
  handles: ReadonlySet<string>;
}

/** Only these tone particles may be added, and only as a single suffix on the whole card. */
export const PARTICLES: readonly string[] = ["นะ", "ค่ะ", "จ้ะ"];
const PARTICLE_MATCH = [...PARTICLES].sort((a, b) => b.length - a.length);

const nfc = (s: string) => s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
/** Trailing spaces/tabs only; a trailing line break is a stop, not whitespace to strip. */
const trimEnd = (s: string) => s.replace(/[ \t\u00A0]+$/u, "");
const endsWithStop = (s: string) => /[\n\r]$/u.test(s) || /\p{P}$/u.test(s);

function particleOnly(origRaw: string, outRaw: string): boolean {
  const orig = trimEnd(nfc(origRaw));
  const out = trimEnd(nfc(outRaw));
  if (out === orig) return true;
  if (endsWithStop(orig)) return false;
  for (const p of PARTICLE_MATCH) {
    if (out === orig + p || out === orig + " " + p) return true;
  }
  return false;
}

/** All failed checks for a reworded `output` of `card` (empty array = accept). */
export function rewordFailures(card: BankCard, output: string | null | undefined, _ctx: RewordContext): RewordCheck[] {
  const fails: RewordCheck[] = [];
  const canon = nfc(card.answer_th);
  const raw = output == null ? "" : nfc(String(output));
  if (!raw.trim()) return ["empty"];
  if (/<\/?think>|\/no_think|<\|im_(start|end)\|>/i.test(raw)) fails.push("think");
  if (!particleOnly(canon, raw)) fails.push("particles");
  return fails;
}

/** Accept the reworded text, or fall back to the exact curated text. */
export function acceptReword(card: BankCard, output: string | null | undefined, ctx: RewordContext): { text: string; reworded: boolean; failures: RewordCheck[] } {
  if (!card.reword) return { text: card.answer_th, reworded: false, failures: [] };
  const failures = rewordFailures(card, output, ctx);
  const clean = output == null ? "" : trimEnd(nfc(String(output)));
  if (failures.length || clean === trimEnd(nfc(card.answer_th))) return { text: card.answer_th, reworded: false, failures };
  return { text: clean, reworded: true, failures };
}
