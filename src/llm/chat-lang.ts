/**
 * Per-turn chat language and the model-call script gate. Rules only — the
 * model never chooses.
 *
 * Reply language (`detectChatLang`): English iff at least 60% of letters are
 * Latin AND the text contains at least two English words. Everything else is
 * Thai. Used for persona, holding line, chip label, and bank English overlay.
 *
 * Model-call gate (`modelChatScript`): letter script only (digits, spaces,
 * punctuation, and emoji are ignored). Thresholds:
 *   - fewer than 2 letters, or no letters → mixed/unclear (no model call)
 *   - Latin share ≥ 60% → English
 *   - Thai share ≥ 60% → clearly Thai (model chat, as before)
 *   - otherwise mixed (when the rest is Latin, Thai share is between 40%
 *     and 60%) → no model call
 * A Thai sentence with one English bank word (PrEP, HIV) stays Thai.
 *
 * Re-evaluate on every turn.
 */

export type ChatLang = "th" | "en";
/** Letter-script class for whether this turn may call the Thai chat model. */
export type ChatScript = "th" | "en" | "mixed";

/** Latin-letter share at or above this is English for both reply language and the model gate. */
export const LATIN_SHARE_ENGLISH = 0.6;
/**
 * Thai-letter share at or above this is clearly Thai for the model-call gate.
 * Mixed is the band below this and below LATIN_SHARE_ENGLISH (Thai share
 * between 40% and 60% when the rest of the letters are Latin).
 */
export const THAI_SHARE_MODEL_CHAT = 0.6;
/** Unclear: fewer than this many letters never reaches the model. */
export const MIN_LETTERS_FOR_SCRIPT = 2;

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
 * Whether this turn may reach Thai model chat. English (≥60% Latin) and
 * mixed/unclear (Thai share between 40% and 60%, <2 letters, no letters,
 * other scripts) do not. Only clearly Thai (Thai letter share ≥ 60%) does.
 */
export function modelChatScript(text: string): ChatScript {
  const raw = text == null ? "" : String(text).normalize("NFC");
  const { latin, thai, total } = lettersOf(raw);
  if (total < MIN_LETTERS_FOR_SCRIPT) return "mixed";
  if (latin / total >= LATIN_SHARE_ENGLISH) return "en";
  if (thai / total >= THAI_SHARE_MODEL_CHAT) return "th";
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
