/**
 * Deterministic split of an approved card's answer_th into numbered sentences.
 * Conditions stay attached to the claim they qualify. If a split would pull a
 * condition (ถ้า / เพราะ / เช่น / …) or a numbered example list away from its
 * introducer, the fragments are kept together. When in doubt, the whole
 * paragraph is one sentence. Never logs text.
 */

const CONDITION_START =
  /^(?:แต่ถ้า|ส่วนถ้า|ถ้าไม่|หากว่า|ทั้งนี้|โดยที่|มิฉะนั้น|ไม่อย่างนั้น|ไม่งั้น|ยกเว้น|เว้นแต่|ซึ่ง|เพราะ|หาก|เมื่อ|ส่วน|เช่น|หรือ|แต่|ถ้า|จึง|โดย)/u;

const INTRO_END = /(?:เช่น|ดังนี้|ดังต่อไปนี้|คือ)\s*[:：]?\s*$/u;
const NUMBERED_ITEM = /^(?:\d+|[๐-๙]+)[.)]\s/;

export function nfcCardText(s: string): string {
  return (s ?? "").normalize("NFC").replace(/\r\n/g, "\n");
}

interface Span {
  start: number;
  end: number;
  text: string;
}

function paragraphSpans(text: string): Span[] {
  const spans: Span[] = [];
  const re = /[^\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const innerStart = raw.search(/\S/);
    if (innerStart < 0) continue;
    const innerEnd = raw.search(/\s*$/);
    const start = m.index + innerStart;
    const end = m.index + (innerEnd < 0 ? raw.length : innerEnd);
    spans.push({ start, end, text: text.slice(start, end) });
  }
  return spans;
}

function shouldAttach(curr: string, prev: string): boolean {
  if (CONDITION_START.test(curr)) return true;
  if (NUMBERED_ITEM.test(curr) && (INTRO_END.test(prev) || NUMBERED_ITEM.test(prev))) return true;
  return false;
}

/**
 * Split `answer_th` into stable sentences. Each sentence is an exact substring
 * of the original (NFC, CRLF normalised). Empty input → [].
 */
export function splitCardSentences(answer: string | null | undefined): string[] {
  const text = nfcCardText(answer == null ? "" : String(answer)).trim();
  if (!text) return [];
  const spans = paragraphSpans(text);
  if (!spans.length) return [text];
  const groups: Span[][] = [];
  for (const s of spans) {
    if (!groups.length) {
      groups.push([s]);
      continue;
    }
    const g = groups[groups.length - 1]!;
    const prev = g[g.length - 1]!;
    if (shouldAttach(s.text, prev.text)) g.push(s);
    else groups.push([s]);
  }
  return groups.map((g) => text.slice(g[0]!.start, g[g.length - 1]!.end));
}

/** Numbered block injected into the system prompt. 0-based, stable. */
export function numberedCardSentences(answer: string | null | undefined): string {
  return splitCardSentences(answer).map((s, i) => `${i}. ${s}`).join("\n");
}
