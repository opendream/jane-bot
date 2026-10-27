// Known name-detector / stripPII false positives in approved cards.
// Exemption is card id + exact span only. A new hit on an approved card still fails
// bank:validate and guard. Draft and unreviewed cards never consult this list.
//
// Harvested from the 34 reviewed cards (27 Oct 2026 pack). Do not add a span
// unless findPII or stripPII flags it on that card today.

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

export function isAllowlistedNameSpan(cardId, span, list = PII_NAME_ALLOWLIST) {
  return list.some((e) => e.id === cardId && e.span === span);
}
