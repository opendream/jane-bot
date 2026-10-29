/**
 * Trim a generated Jane reply to its last complete sentence so a max-token
 * cut-off never ships mid-word. Complete = a Thai ending particle, a newline,
 * or ./!/? . Null means nothing complete is left (caller retries, then card).
 * Never logs text.
 */

const PARTICLES = [
  "นะค่ะ", "นะคะ", "นะจ๊ะ", "นะจ้ะ", "ครับผม", "ค่ะนะ",
  "ค่ะ", "คะ", "ครับ", "จ้ะ", "จ๊ะ", "จ้า", "น้า", "นะ", "เลย",
] as const;

function nfc(s: string): string {
  return s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function particleEnd(text: string, i: number): number {
  for (const p of PARTICLES) {
    if (!text.startsWith(p, i)) continue;
    let end = i + p.length;
    if (p === "จ้า" || p === "น้า") {
      while (text[end] === "า") end++;
    }
    const after = text[end];
    if (after != null && !/[\s.!?…,]/.test(after) && end !== text.length) continue;
    return end;
  }
  return -1;
}

function extendPunct(text: string, end: number): number {
  while (end < text.length && /[.!?…]/.test(text[end]!)) end++;
  return end;
}

/** True when `text` already ends on a complete-sentence boundary. */
export function endsComplete(text: string): boolean {
  const t = nfc(text).trimEnd();
  if (!t) return false;
  if (/[.!?…]$/u.test(t) || /\n\s*$/u.test(t)) return true;
  for (let i = 0; i < t.length; i++) {
    const end = particleEnd(t, i);
    if (end === t.length) return true;
  }
  return false;
}

/**
 * Last complete sentence, or null if none. If the reply already ends complete,
 * the full trimmed string is kept (including a trailing เลย / ค่ะ / .).
 */
export function trimToLastCompleteSentence(raw: string | null | undefined): string | null {
  const text = nfc(raw == null ? "" : String(raw)).trim();
  if (!text) return null;
  if (endsComplete(text)) return text;

  let best = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n" || /[.!?…]/.test(ch)) best = Math.max(best, extendPunct(text, i + 1));
    const pEnd = particleEnd(text, i);
    if (pEnd > 0) best = Math.max(best, extendPunct(text, pEnd));
  }
  if (best <= 0) return null;
  const out = text.slice(0, best).trim();
  return out && endsComplete(out) ? out : null;
}
