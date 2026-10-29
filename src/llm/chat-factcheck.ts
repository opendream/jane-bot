/**
 * Sentence-level faithfulness check for grounded Jane chat. Never loosens
 * chatGuard or the AMBIGUOUS guard. Fact checks only ever reject.
 *
 * Each reply sentence is either (A) a whole DRAFT empathy phrase or (B) a
 * close restatement of one card sentence (character LCS, matching polarity
 * and numbers, subject kept). No card → only (A). Synthetic strings only.
 * Never logs text.
 */

import { compact } from "../core/text";
import {
  CHAT_EMPATHY_PHRASES_EN,
  CHAT_EMPATHY_PHRASES_TH,
} from "./chat-factcheck-empathy";
import {
  hasWordSegmenter,
  nfcText,
  numberValues,
  wordSpans,
} from "./chat-words";

export type FactCheckReason = "quantity" | "polarity" | "topic" | "coverage";

/**
 * 85% of the reply sentence (whitespace, punctuation, digits, and Jane ending
 * voice stripped; letters kept so English facts still score) must be an
 * ordered subsequence of one card sentence. The Codex-named ช่วย restatement
 * lands just above this bar; polarity, numbers, and topic catch meaning flips
 * that LCS would miss.
 */
export const FACT_LCS_MIN = 0.85;

const ENDING_PARTICLES = [
  "นะค่ะ", "นะคะ", "นะจ๊ะ", "นะจ้ะ", "ครับผม", "ค่ะนะ",
  "ค่ะ", "คะ", "ครับ", "จ้ะ", "จ๊ะ", "จ้า", "น้า", "นะ", "เลย",
] as const;

const NEGATORS: readonly string[] = [
  "ไม่สามารถ", "cannot", "can't", "dont", "don't", "doesnt", "doesn't",
  "didnt", "didn't", "wont", "won't", "never",
  "ไม่ได้", "ไม่ต้อง", "ไม่ควร", "ไม่ใช่", "ยังไม่", "ห้าม", "อย่า", "ไม่",
  "not",
];

/**
 * Competing subject terms. Longest first inside each group. A reply sentence
 * may not swap the matched card sentence's group for another group.
 */
const TOPIC_GROUPS: readonly (readonly string[])[] = [
  ["ยาคุมฉุกเฉิน"],
  ["ยาคุมกำเนิด", "ยาคุม"],
  ["ถุงยางอนามัย", "ถุงยาง"],
  ["เพร็พ", "prep"],
  ["เอชไอวี", "hiv"],
  ["ห่วงอนามัย"],
  ["ยาฝัง", "ฝังยา"],
  ["ยาฉีด"],
];

function nfc(s: string): string {
  return nfcText(s);
}

function collapseWs(s: string): string {
  return nfc(s).toLowerCase().replace(/[.!?…,;:]+/g, " ").replace(/\s+/g, " ").trim();
}

function particleEnd(text: string, i: number): number {
  for (const p of ENDING_PARTICLES) {
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

function stripTrailingParticlesText(s: string): string {
  let t = collapseWs(s);
  let changed = true;
  while (changed && t) {
    changed = false;
    for (const p of ENDING_PARTICLES) {
      if (p === "จ้า" || p === "น้า") {
        const re = new RegExp(`${p}า*$`);
        if (re.test(t) && t !== p && t.length > p.length) {
          t = t.replace(re, "").replace(/\s+/g, " ").trim();
          changed = true;
          break;
        }
      }
      if (t.endsWith(p) && t.length > p.length) {
        t = t.slice(0, t.length - p.length).replace(/\s+/g, " ").trim();
        changed = true;
        break;
      }
    }
  }
  return t;
}

function stripTrailingVoiceCompact(s: string): string {
  let t = s;
  let changed = true;
  while (changed && t) {
    changed = false;
    for (const p of ENDING_PARTICLES) {
      if (p === "จ้า" || p === "น้า") {
        const re = new RegExp(`${p}า*$`);
        if (re.test(t) && t.length > p.length) {
          t = t.replace(re, "");
          changed = true;
          break;
        }
      }
      if (t.endsWith(p) && t.length > p.length) {
        t = t.slice(0, t.length - p.length);
        changed = true;
        break;
      }
    }
  }
  if (t.endsWith("ได้") && !t.endsWith("ไม่ได้") && t.length > 3) t = t.slice(0, -3);
  return t;
}

/** Whitespace-stripped text used for character LCS. Ending voice is not a fact. */
export function stripForLcs(s: string): string {
  const t = nfc(s)
    .toLowerCase()
    .replace(/[0-9๐-๙()[\]{}.!?,:;'"…%/_-]/g, "")
    .replace(/\s+/g, "");
  return stripTrailingVoiceCompact(t);
}

export function lcsLength(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (!x.length || !y.length) return 0;
  let prev = new Array<number>(y.length + 1).fill(0);
  let cur = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      cur[j] = x[i - 1] === y[j - 1] ? (prev[j - 1]! + 1) : Math.max(prev[j]!, cur[j - 1]!);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
    cur.fill(0);
  }
  return prev[y.length]!;
}

export function lcsCover(reply: string, cardSentence: string): number {
  const a = stripForLcs(reply);
  const b = stripForLcs(cardSentence);
  if (!a.length) return 0;
  return lcsLength(a, b) / a.length;
}

function splitOnPunctParticlesNewlines(text: string): string[] {
  const raw = nfc(text).replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const out: string[] = [];
  let start = 0;
  const push = (end: number) => {
    const s = raw.slice(start, end).trim();
    if (s) out.push(s);
    start = end;
    while (start < raw.length && /\s/.test(raw[start]!)) start++;
  };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "\n") {
      push(i);
      continue;
    }
    if (/[.!?…]/.test(ch)) {
      let end = i + 1;
      while (end < raw.length && /[.!?…]/.test(raw[end]!)) end++;
      push(end);
      i = end - 1;
      continue;
    }
    const pEnd = particleEnd(raw, i);
    if (pEnd > i) {
      push(pEnd);
      i = pEnd - 1;
    }
  }
  if (start < raw.length) {
    const rest = raw.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out;
}

function isEmpathyPhrase(sentence: string): boolean {
  const norm = stripTrailingParticlesText(sentence);
  if (!norm) return false;
  const compactNorm = compact(norm);
  for (const p of CHAT_EMPATHY_PHRASES_TH) {
    const n = stripTrailingParticlesText(p);
    if (norm === n || compactNorm === compact(n)) return true;
  }
  for (const p of CHAT_EMPATHY_PHRASES_EN) {
    if (norm === p) return true;
  }
  return false;
}

function splitEmpathyPrefixes(chunk: string): string[] {
  if (!/[\u0E00-\u0E7F]/.test(chunk)) return [chunk.trim()].filter(Boolean);
  const parts: string[] = [];
  let rest = chunk.trim();
  while (rest) {
    let splitAt = -1;
    for (let i = 1; i < rest.length; i++) {
      if (rest[i] !== " ") continue;
      if (isEmpathyPhrase(rest.slice(0, i))) {
        splitAt = i;
        break;
      }
    }
    if (splitAt < 0) break;
    parts.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Reply/card sentences: particles, newlines, .!?, and a leading empathy phrase before a space. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const chunk of splitOnPunctParticlesNewlines(text)) {
    out.push(...splitEmpathyPrefixes(chunk));
  }
  return out.filter((s) => s.trim().length > 0);
}

function clauseSplits(sentence: string): string[] {
  return nfc(sentence)
    .split(/\s*(?:แต่|หรือ|,|;)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function polarityBag(sentence: string): string[] {
  const found: string[] = [];
  for (const clause of clauseSplits(sentence)) {
    const words = wordSpans(clause);
    const toks = words.map((w) => w.word.toLowerCase().replace(/'/g, ""));
    const used = new Array<boolean>(toks.length).fill(false);
    for (const neg of NEGATORS) {
      const needle = neg.replace(/'/g, "");
      for (let i = 0; i < toks.length; i++) {
        if (used[i]) continue;
        if (toks[i] === needle) {
          found.push(lemmaNeg(neg));
          used[i] = true;
          continue;
        }
        if (i + 1 < toks.length && !used[i + 1] && `${toks[i]}${toks[i + 1]}` === needle) {
          found.push(lemmaNeg(neg));
          used[i] = true;
          used[i + 1] = true;
        }
      }
    }
  }
  return found.sort();
}

function lemmaNeg(neg: string): string {
  if (neg === "ห้าม" || neg === "อย่า") return neg;
  if (/never|not|don't|dont|can't|cannot|doesn't|didn't|won't/i.test(neg)) return "not";
  return "ไม่";
}

function samePolarity(reply: string, cardSentence: string): boolean {
  return polarityBag(reply).join(",") === polarityBag(cardSentence).join(",");
}

function extraNumbers(reply: string, cardSentence: string): boolean {
  const allowed = new Set(numberValues(cardSentence));
  for (const v of numberValues(reply)) {
    if (!allowed.has(v)) return true;
  }
  return false;
}

function topicGroupIds(text: string): Set<string> {
  const c = compact(text);
  const hit = new Set<string>();
  const used = new Array<boolean>(c.length).fill(false);
  const terms = TOPIC_GROUPS
    .flatMap((g) => g.map((t) => ({ t: compact(t), id: compact(g[0]!) })))
    .sort((a, b) => b.t.length - a.t.length);
  for (const { t, id } of terms) {
    let from = 0;
    while (from <= c.length - t.length) {
      const i = c.indexOf(t, from);
      if (i < 0) break;
      let blocked = false;
      for (let k = i; k < i + t.length; k++) if (used[k]) blocked = true;
      if (!blocked) {
        hit.add(id);
        for (let k = i; k < i + t.length; k++) used[k] = true;
      }
      from = i + t.length;
    }
  }
  return hit;
}

function topicKept(reply: string, cardSentence: string): boolean {
  const cardT = topicGroupIds(cardSentence);
  const replyT = topicGroupIds(reply);
  for (const t of replyT) {
    if (!cardT.has(t)) return false;
  }
  if (cardT.size > 0) {
    for (const t of cardT) if (replyT.has(t)) return true;
    return false;
  }
  return true;
}

function classifySentence(sentence: string, cardSentences: readonly string[]): FactCheckReason | null {
  if (isEmpathyPhrase(sentence)) return null;
  if (!cardSentences.length) return "coverage";
  let best = -1;
  let bestCover = -1;
  for (let i = 0; i < cardSentences.length; i++) {
    const cover = lcsCover(sentence, cardSentences[i]!);
    if (cover > bestCover) {
      bestCover = cover;
      best = i;
    }
  }
  if (best < 0 || bestCover < FACT_LCS_MIN) return "coverage";
  const cardSent = cardSentences[best]!;
  if (!samePolarity(sentence, cardSent)) return "polarity";
  if (extraNumbers(sentence, cardSent)) return "quantity";
  if (!topicKept(sentence, cardSent)) return "topic";
  return null;
}

/** Failed fact-check reasons (empty = accept). Add-only; never logs text. */
export function chatFactCheckFailures(reply: string | null | undefined, cardText: string | null | undefined): FactCheckReason[] {
  const raw = nfc(reply == null ? "" : String(reply));
  const card = nfc(cardText == null ? "" : String(cardText));
  if (!raw.trim()) return [];
  if (!hasWordSegmenter()) return ["coverage"];
  const sentences = splitSentences(raw);
  if (!sentences.length) return ["coverage"];
  const cardSentences = card.trim() ? splitSentences(card) : [];
  const fails: FactCheckReason[] = [];
  for (const s of sentences) {
    const reason = classifySentence(s, cardSentences);
    if (reason && !fails.includes(reason)) fails.push(reason);
  }
  return fails;
}

export function acceptChatFacts(
  reply: string | null | undefined,
  cardText: string | null | undefined,
): { ok: true } | { ok: false; reasons: FactCheckReason[] } {
  const reasons = chatFactCheckFailures(reply, cardText);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true };
}
