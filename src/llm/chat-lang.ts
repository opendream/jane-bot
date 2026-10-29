/**
 * Per-turn chat language and the model-call script gate. Rules only — the
 * model never chooses.
 *
 * Reply language (`detectChatLang`): NFKC + Latin fold + lowercase, strip the
 * health-loanword allowlist, then English iff at least 60% of remaining letters
 * are Latin AND the remaining text contains at least two English words.
 * Everything else is Thai. Used for persona, holding line, chip label, and
 * bank English overlay. Thai combining vowel/tone marks are not letters, so
 * without the strip a short line like "กิน PrEP" would look Latin-majority.
 *
 * Model-call gate (`modelChatScript`): NFKC + Latin fold + lowercase
 * (Thai unchanged), then a short whole-word, case-insensitive health-loanword
 * allowlist is stripped (digits, spaces, punctuation, and emoji are ignored).
 * Thresholds:
 *   - fewer than 2 letters, or no letters → mixed/unclear (no model call)
 *   - any remaining letter that is not Thai → English if original Latin
 *     share ≥ 60%, otherwise mixed (no model call)
 *   - every remaining letter is Thai and there are ≥ 2 → Thai chat
 * Allowlisted loanwords (HIV, PrEP, condom, …) do not block Thai chat.
 * A Thai sentence with a non-allowlisted English word (including fullwidth
 * or accented letters) does not call the model. English-only lines stay English.
 *
 * Re-evaluate on every turn.
 */

import { prepCheckText } from "../core/text";

export type ChatLang = "th" | "en";
/** Letter-script class for whether this turn may call the Thai chat model. */
export type ChatScript = "th" | "en" | "mixed";

/** Latin-letter share at or above this is English for both reply language and the model gate. */
export const LATIN_SHARE_ENGLISH = 0.6;
/**
 * Thai-letter share of text remaining after the loanword allowlist is
 * stripped. At or above this (with no leftover non-Thai letters) is Thai model chat.
 */
export const THAI_SHARE_MODEL_CHAT = 0.6;
/** Unclear: fewer than this many letters never reaches the model. */
export const MIN_LETTERS_FOR_SCRIPT = 2;

/**
 * Whole-word, case-insensitive clinical/health loanwords already used in
 * the Thai bank and test/eval queries. After these tokens are removed,
 * any remaining non-Thai letter means this turn is not Thai model chat.
 * Keep this list short.
 */
export const HEALTH_LOANWORDS = [
  "hiv", "prep", "pep", "condom", "condoms", "sti", "stis", "std", "stds",
  "hpv", "ec", "iud", "iuds", "rsa",
] as const;

const HEALTH_LOANWORD_SET = new Set<string>(HEALTH_LOANWORDS);

function fold(text: string): string {
  return prepCheckText(text);
}

/** Drop allowlisted loanwords; leftover Latin tokens are left in place. */
function stripHealthLoanwords(s: string): string {
  return s.replace(/[A-Za-z]+/g, (tok) => (HEALTH_LOANWORD_SET.has(tok.toLowerCase()) ? " " : tok));
}

/**
 * Common English function words plus SRH terms Jane actually sees.
 * Matching is whole-token and case-insensitive; apostrophes are stripped
 * so "I'm" / "don't" still count.
 */
const ENGLISH_WORDS = new Set<string>([
  "a", "about", "after", "again", "all", "also", "am", "an", "and", "any", "are", "around",
  "ask", "at", "be", "because", "been", "before", "being", "birth", "boyfriend", "but", "by",
  "can", "cant", "condom", "condoms", "contraception", "contraceptive", "control", "could",
  "did", "didnt", "do", "does", "doesnt", "dont", "emergency", "feel", "for", "from",
  "girlfriend", "had", "has", "have", "he", "help", "hello", "her", "here", "hi", "him", "his",
  "hiv", "how", "i", "if", "im", "in", "info", "information", "is", "it", "just", "know",
  "let", "like", "me", "more", "my", "need", "no", "not", "now", "of", "ok", "okay", "on",
  "or", "our", "period", "pill", "pills", "please", "pregnant", "pregnancy", "prep", "safe",
  "say", "sex", "sexual", "she", "should", "show", "so", "sti", "talk", "tell", "test", "testing", "than",
  "thank", "thanks", "that", "the", "there", "they", "this", "to", "too", "us", "want",
  "was", "we", "what", "when", "where", "which", "who", "why", "will", "with", "worried",
  "would", "yes", "you", "your",
]);

function lettersOf(s: string): { latin: number; thai: number; total: number } {
  let latin = 0;
  let thai = 0;
  let total = 0;
  for (const c of s) {
    if (!/\p{L}/u.test(c)) continue;
    total++;
    if (/\p{Script=Thai}/u.test(c)) thai++;
    else if (/\p{Script=Latin}/u.test(c)) latin++;
  }
  return { latin, thai, total };
}

function englishWordCount(s: string): number {
  const tokens = s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  let n = 0;
  for (const raw of tokens) {
    if (ENGLISH_WORDS.has(raw.replace(/'/g, ""))) n++;
  }
  return n;
}

/** Latin-letter share of all letters. 0 when the text has no letters. */
export function latinLetterShare(s: string): number {
  const { latin, total } = lettersOf(fold(s));
  return total === 0 ? 0 : latin / total;
}

export function detectChatLang(text: string): ChatLang {
  const raw = fold(text);
  const stripped = stripHealthLoanwords(raw);
  const { latin, total } = lettersOf(stripped);
  if (total === 0) return "th";
  if (latin / total < LATIN_SHARE_ENGLISH) return "th";
  if (englishWordCount(stripped) < 2) return "th";
  return "en";
}

/**
 * Whether this turn may reach Thai model chat. NFKC-normalise, then strip
 * allowlisted health loanwords. Thai chat only if every remaining letter is
 * Thai. Any other remaining letter is not Thai chat (English if the original
 * Latin share is ≥ 60%, otherwise mixed).
 */
export function modelChatScript(text: string): ChatScript {
  const raw = fold(text);
  const original = lettersOf(raw);
  if (original.total < MIN_LETTERS_FOR_SCRIPT) return "mixed";

  const remaining = lettersOf(stripHealthLoanwords(raw));
  const nonThai = remaining.total - remaining.thai;
  if (nonThai > 0) {
    if (original.latin / original.total >= LATIN_SHARE_ENGLISH) return "en";
    return "mixed";
  }
  if (remaining.total >= MIN_LETTERS_FOR_SCRIPT && remaining.thai === remaining.total) {
    return "th";
  }
  if (original.latin / original.total >= LATIN_SHARE_ENGLISH) return "en";
  return "mixed";
}

/**
 * Reply-script check for an English turn. Same 60% Latin rule as detection,
 * but no English-word minimum (a short "I'm here." must still pass).
 */
export function mostlyLatin(text: string): boolean {
  const { latin, total } = lettersOf(fold(text));
  if (total === 0) return false;
  return latin / total >= LATIN_SHARE_ENGLISH;
}
