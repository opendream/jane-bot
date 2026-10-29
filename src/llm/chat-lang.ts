/**
 * Per-turn chat language. Rules only — the model never chooses.
 *
 * English iff at least 60% of letters are Latin AND the text contains at least
 * two English words. Everything else is Thai. Re-evaluate on every turn.
 * No other mixed-language detection.
 */

export type ChatLang = "th" | "en";

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

function lettersOf(s: string): { latin: number; total: number } {
  let latin = 0;
  let total = 0;
  for (const c of s) {
    if (!/\p{L}/u.test(c)) continue;
    total++;
    if (/[A-Za-z]/.test(c)) latin++;
  }
  return { latin, total };
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
  if (latin / total < 0.6) return "th";
  if (englishWordCount(raw) < 2) return "th";
  return "en";
}

/**
 * Reply-script check for an English turn. Same 60% Latin rule as detection,
 * but no English-word minimum (a short "I'm here." must still pass).
 */
export function mostlyLatin(text: string): boolean {
  const { latin, total } = lettersOf(text.normalize("NFC"));
  if (total === 0) return false;
  return latin / total >= 0.6;
}
