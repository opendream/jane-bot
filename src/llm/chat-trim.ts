/**
 * Trim a generated Jane reply to its last complete sentence so a max-token
 * cut-off never ships mid-word. Complete = a Thai ending particle, a newline,
 * or ./!/? , and at least MIN_CONTENT_WORDS non-particle words. A lone
 * particle (ค่ะ / นะ) is not complete: caller retries, then card.
 * Never logs text.
 */

import { contentWordCount, MIN_CONTENT_WORDS, nfcText } from "./chat-words";

const PARTICLES = [
  "นะค่ะ", "นะคะ", "นะจ๊ะ", "นะจ้ะ", "ครับผม", "ค่ะนะ",
  "ค่ะ", "คะ", "ครับ", "จ้ะ", "จ๊ะ", "จ้า", "น้า", "นะ", "เลย",
] as const;

function nfc(s: string): string {
  return nfcText(s);
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

function hasMinContent(text: string): boolean {
  return contentWordCount(text, PARTICLES) >= MIN_CONTENT_WORDS;
}

function endsOnBoundary(text: string): boolean {
  const t = nfc(text).trimEnd();
  if (!t) return false;
  if (/[.!?…]$/u.test(t) || /\n\s*$/u.test(t)) return true;
  for (let i = 0; i < t.length; i++) {
    const end = particleEnd(t, i);
    if (end === t.length) return true;
  }
  return false;
}

/** True when `text` already ends on a complete, meaningful sentence. */
export function endsComplete(text: string): boolean {
  const t = nfc(text).trimEnd();
  if (!t) return false;
  return endsOnBoundary(t) && hasMinContent(t);
}

/**
 * Last complete sentence, or null if none. If the reply already ends complete,
 * the full trimmed string is kept (including a trailing เลย / ค่ะ / .).
 * A slice that is only a particle, or under MIN_CONTENT_WORDS, is discarded.
 */
export function trimToLastCompleteSentence(raw: string | null | undefined): string | null {
  const text = nfc(raw == null ? "" : String(raw)).trim();
  if (!text) return null;
  if (endsComplete(text)) return text;

  let best = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n" || /[.!?…]/.test(ch)) {
      const end = extendPunct(text, i + 1);
      const slice = text.slice(0, end).trim();
      if (endsComplete(slice)) best = Math.max(best, end);
    }
    const pEnd = particleEnd(text, i);
    if (pEnd > 0) {
      const end = extendPunct(text, pEnd);
      const slice = text.slice(0, end).trim();
      if (endsComplete(slice)) best = Math.max(best, end);
    }
  }
  if (best <= 0) return null;
  const out = text.slice(0, best).trim();
  return out && endsComplete(out) ? out : null;
}
