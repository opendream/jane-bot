/** Normalise Thai/English free text for matching. */
export function normalize(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** normalize() without spaces (Thai users space words unpredictably). */
export function compact(input: string): string {
  return normalize(input).replace(/\s+/g, "");
}

const SHORT_LATIN = /^[a-z0-9 '\-]{1,5}$/;

export interface PhraseHit {
  needle: string;
  /** Compact Thai / normalised short-Latin key so whitespace twins share an identity. */
  key: string;
  start: number;
  end: number;
  haystack: "compact" | "norm";
}

/** Matching identity after whitespace normalisation (compact Thai, whole-word Latin). */
export function phraseKey(needle: string): string {
  const k = normalize(needle);
  if (!k) return "";
  if (SHORT_LATIN.test(k)) return `latin:${k}`;
  return `th:${k.replace(/\s+/g, "")}`;
}

/**
 * Match spans for `needles` in `raw`. Same hit rule as findPhrases; also returns where
 * each needle sat so callers can count whitespace twins / identical spans once.
 */
export function findPhraseHits(raw: string, needles: readonly string[]): PhraseHit[] {
  const norm = normalize(raw);
  const comp = norm.replace(/\s+/g, "");
  const hits: PhraseHit[] = [];
  for (const n of needles) {
    const k = normalize(n);
    if (!k) continue;
    if (SHORT_LATIN.test(k)) {
      const re = new RegExp(`(^|[^a-z])(${k.replace(/[-']/g, "\\$&")})([^a-z]|$)`);
      const m = re.exec(norm);
      if (!m) continue;
      const start = m.index + m[1].length;
      hits.push({ needle: n, key: phraseKey(n), start, end: start + k.length, haystack: "norm" });
    } else {
      const needle = k.replace(/\s+/g, "");
      const start = comp.indexOf(needle);
      if (start < 0) continue;
      hits.push({ needle: n, key: phraseKey(n), start, end: start + needle.length, haystack: "compact" });
    }
  }
  return hits;
}

/**
 * Returns the needles found in `raw`.
 * Thai (and long phrases): space-insensitive substring match.
 * Short Latin tokens (e.g. "sti", "pep"): whole-word match, so "question" does not hit "sti".
 */
export function findPhrases(raw: string, needles: readonly string[]): string[] {
  return findPhraseHits(raw, needles).map((h) => h.needle);
}
