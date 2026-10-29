/**
 * Per-turn chat language and the model-call script gate. Rules only — the
 * model never chooses.
 *
 * Reply language (`detectChatLang`): English iff at least 60% of letters are
 * Latin AND the text contains at least two English words. Everything else is
 * Thai. Used for persona, holding line, chip label, and bank English overlay.
 *
 * Model-call gate (`modelChatScript`): letter script after a short
 * whole-word, case-insensitive health-loanword allowlist is stripped
 * (digits, spaces, punctuation, and emoji are ignored). Thresholds:
 *   - fewer than 2 letters, or no letters → mixed/unclear (no model call)
 *   - any non-allowlisted Latin remaining, and original Latin share ≥ 60%
 *     → English
 *   - any other remaining Latin → mixed (no model call)
 *   - no remaining Latin and Thai share of what remains ≥ 60% → Thai chat
 *   - otherwise mixed
 * Allowlisted loanwords (HIV, PrEP, condom, …) do not block Thai chat.
 * A Thai sentence with a non-allowlisted English word does not call the
 * model. English-only lines stay English.
 *
 * Re-evaluate on every turn.
 */

export type ChatLang = "th" | "en";
/** Letter-script class for whether this turn may call the Thai chat model. */
export type ChatScript = "th" | "en" | "mixed";

/** Latin-letter share at or above this is English for both reply language and the model gate. */
export const LATIN_SHARE_ENGLISH = 0.6;
/**
 * Thai-letter share of text remaining after the loanword allowlist is
 * stripped. At or above this (with no leftover Latin) is Thai model chat.
 */
export const THAI_SHARE_MODEL_CHAT = 0.6;
/** Unclear: fewer than this many letters never reaches the model. */
export const MIN_LETTERS_FOR_SCRIPT = 2;

/**
 * Whole-word, case-insensitive clinical/health loanwords already used in
 * the Thai bank and test/eval queries. After these tokens are removed,
 * any remaining Latin letter means this turn is not Thai model chat.
 * Keep this list short.
 */
export const HEALTH_LOANWORDS = [
  "hiv", "prep", "pep", "condom", "condoms", "sti", "stis", "std", "stds",
  "hpv", "ec", "iud", "iuds", "rsa",
] as const;

const HEALTH_LOANWORD_SET = new Set<string>(HEALTH_LOANWORDS);

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
    if (/[A-Za-z]/.test(c)) latin++;
    else if (/\p{Script=Thai}/u.test(c)) thai++;
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
  const { latin, total } = lettersOf(s.normalize("NFC"));
  return total === 0 ? 0 : latin / total;
}

export function detectChatLang(text: string): ChatLang {
  const raw = text == null ? "" : String(text).normalize("NFC");
  const { latin, total } = lettersOf(raw);
  if (total === 0) return "th";
  if (latin / total < LATIN_SHARE_ENGLISH) return "th";
  if (englishWordCount(raw) < 2) return "th";
  return "en";
}

/**
 * Whether this turn may reach Thai model chat. Strip allowlisted health
 * loanwords first. Any leftover Latin letter is not Thai chat (English if
 * the original Latin share is ≥ 60%, otherwise mixed). Only remaining
 * text with no Latin and Thai letter share ≥ 60% is Thai chat.
 */
export function modelChatScript(text: string): ChatScript {
  const raw = text == null ? "" : String(text).normalize("NFC");
  const original = lettersOf(raw);
  if (original.total < MIN_LETTERS_FOR_SCRIPT) return "mixed";

  const remaining = lettersOf(stripHealthLoanwords(raw));
  if (remaining.latin > 0) {
    if (original.latin / original.total >= LATIN_SHARE_ENGLISH) return "en";
    return "mixed";
  }
  if (remaining.total >= MIN_LETTERS_FOR_SCRIPT && remaining.thai / remaining.total >= THAI_SHARE_MODEL_CHAT) {
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
  const { latin, total } = lettersOf(text.normalize("NFC"));
  if (total === 0) return false;
  return latin / total >= LATIN_SHARE_ENGLISH;
}
