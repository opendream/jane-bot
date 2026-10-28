// Known name-detector / stripPII-name false positives in approved cards.
// Exemption is card id + exact detector span only, at the occurrence(s) of that
// span on that card. A glued or extended match is a different span and still
// fails bank:validate and guard. Draft and unreviewed cards never consult this list.
//
// Harvested from the 35 reviewed cards (27 Oct 2026 pack, including #21). Do not add a span
// unless findPII or stripPII's name rules flag it on that card today.
// School/address skip on approved copy is not this list (same as at base).

/** @typedef {{ id: string, span: string, why: string }} NameAllowEntry */

/** @type {readonly NameAllowEntry[]} */
export const PII_NAME_ALLOWLIST = Object.freeze([
  // Jane persona intro. findPII already treats พี่เจน as generic; stripPII's ชื่อ rule still matches.
  Object.freeze({
    id: "general.welcome.000",
    span: "ชื่อพี่เจน",
    why: "Public character name in the welcome line, not a personal name.",
  }),
  // "ไม่แจ้งชื่อ มีคลินิกนิรนาม" — the detector reads ชื่อ + the clinic phrase as a Thai name.
  Object.freeze({
    id: "disease.hiv.002",
    span: "ชื่อ มีคลินิกนิรนาม",
    why: "Anonymous-clinic wording after ไม่แจ้งชื่อ, not a person's name.",
  }),
  // "HIV Self-Test" product name; ENGLISH_CAPITALISED emits each word.
  Object.freeze({
    id: "disease.hiv.002",
    span: "Self",
    why: "HIV Self-Test product name, not a personal name.",
  }),
  Object.freeze({
    id: "disease.hiv.002",
    span: "Test",
    why: "HIV Self-Test product name, not a personal name.",
  }),
]);

export function allowlistedSpans(cardId, list = PII_NAME_ALLOWLIST) {
  return list.filter((e) => e.id === cardId).map((e) => e.span);
}

/** True only when the detector's matched span equals that card's allowlisted text. */
export function isAllowlistedNameSpan(cardId, span, list = PII_NAME_ALLOWLIST) {
  return list.some((e) => e.id === cardId && e.span === span);
}

/** Name-only stripPII rules. Must match the ชื่อ / "my name is" entries in pii-patterns.mjs STRIP_RULES. */
const STRIP_NAME_RULES = Object.freeze([
  /(?<!เ)(?:ชื่อเล่น|ชื่อจริง|ชื่อ|นามสกุล)\s*(?:คือ|ว่า)?\s*[^\s,.!?]+/g,
  /(?:my name is|i am called|i'm called)\s+\S+/gi,
]);

/** stripPII name-rule matches on the original text (indices + exact matched span). */
export function stripPIINameMatches(text) {
  const s = String(text ?? "");
  const out = [];
  for (const re of STRIP_NAME_RULES) {
    const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of s.matchAll(rx)) {
      out.push({ start: m.index, end: m.index + m[0].length, span: m[0] });
    }
  }
  return out;
}

/**
 * Name-rule matches that are not an exact allowlisted span for this card.
 * A match that extends or adjoins an allowlisted occurrence (longer span at
 * that index) is leftover. School/address rules are not included.
 */
export function leftoverStripPIINameSpans(cardId, text, list = PII_NAME_ALLOWLIST) {
  return stripPIINameMatches(text)
    .filter((m) => !isAllowlistedNameSpan(cardId, m.span, list))
    .map((m) => m.span);
}
