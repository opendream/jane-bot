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

/**
 * Returns the needles found in `raw`.
 * Thai (and long phrases): space-insensitive substring match.
 * Short Latin tokens (e.g. "sti", "pep"): whole-word match, so "question" does not hit "sti".
 */
export function findPhrases(raw: string, needles: readonly string[]): string[] {
  const norm = normalize(raw);
  const comp = norm.replace(/\s+/g, "");
  const hits: string[] = [];
  for (const n of needles) {
    if (typeof n !== "string") continue;
    const k = normalize(n);
    if (!k) continue;
    if (SHORT_LATIN.test(k)) {
      const re = new RegExp(`(^|[^a-z])${k.replace(/[-']/g, "\\$&")}([^a-z]|$)`);
      if (re.test(norm)) hits.push(n);
    } else if (comp.includes(k.replace(/\s+/g, ""))) {
      hits.push(n);
    }
  }
  return hits;
}
