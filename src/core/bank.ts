import type { Intent } from "./types";
import { AGE_REDIRECT_ID, ageAllowed as ageAllowedFor, type AgeState } from "./age";
import { VALID_INTENTS } from "../llm/adapter";
import { stripPII } from "./summary";
// Shared with the Node guard (plain JS). Phone matching blanks clock times first.
// @ts-ignore
import { findPII, findPhoneSpans, scrubPII, REDACTED } from "../../scripts/bank/pii-patterns.mjs";
// @ts-ignore
import { PII_NAME_ALLOWLIST, isAllowlistedNameSpan, allowlistedSpans } from "../../scripts/bank/pii-name-allowlist.mjs";

/* ------------------------------------------------------------------------------------------
 * Answer bank (build plan v2 §1). One JSON file per topic under src/data/bank/.
 * Only `answer_th` (and reviewed `variants_th`) may be shown verbatim. Pure module: no I/O.
 * ---------------------------------------------------------------------------------------- */

export type BankTopic = Intent | "general" | "ending" | "quiz";
export const BANK_TOPICS: readonly BankTopic[] = [...VALID_INTENTS, "general", "ending", "quiz"];

export type ReviewStatus = "draft" | "in_review" | "approved" | "rejected";
export const REVIEW_STATUSES: readonly ReviewStatus[] = ["draft", "in_review", "approved", "rejected"];

export type CardFlag = "medical" | "legal" | "hotline" | "hours" | "price" | "pii_checked" | "fb_payload_removed";
export const CARD_FLAGS: readonly CardFlag[] = ["medical", "legal", "hotline", "hours", "price", "pii_checked", "fb_payload_removed"];

export interface CardSource { by: string; url: string; title: string; as_of?: string; checked: string }
export interface CardReview { status: ReviewStatus; reviewer: string | null; reviewed_on: string | null; notes?: string }
export interface CardNext { label_th: string; card_id: string }
export interface CardLink { url: string; label_th: string }
export interface CardReferral { offer: "none" | "soft" | "strong"; intents: Intent[] }

export interface BankCard {
  id: string;
  topic: BankTopic;
  title_th: string;
  answer_th: string;
  variants_th?: string[];
  key_facts: string[];
  triggers: string[];
  next: CardNext[];
  source_intents: string[];
  source: CardSource[];
  review: CardReview;
  last_reviewed: string | null;
  flags: CardFlag[];
  referral: CardReferral;
  links: CardLink[];
  age_min: 15 | 18;
  reword: boolean;
  licence: string;
  /** Stand-in content written for the build (not ThaiHealth content). Never ships once copy is "reviewed". */
  placeholder?: boolean;
}

/** SPDX id for answer-bank text (cards). Product copy such as refusal cards may use another licence. */
export const BANK_TEXT_LICENCE = "CC-BY-SA-4.0";

/** Production bank cards must carry the answer-text SPDX id. Callers that mix in product copy skip this. */
export function checkBankTextLicence(cards: BankCard[]): Issue[] {
  return cards
    .filter((c) => !isStr(c?.licence) || c.licence !== BANK_TEXT_LICENCE)
    .map((c) => ({ level: "error" as const, card: safeCardId(c?.id), rule: "licence", msg: `licence must be ${BANK_TEXT_LICENCE}` }));
}

/** Eval question-set JSON files (46-item seed+paraphrase, plus the crisis FP probe). */
export const EVAL_ITEM_FILES = [
  "evals/seed-set.json",
  "evals/paraphrase-set.json",
  "evals/crisis-fp-set.json",
] as const;

/** File-level licence on an eval item JSON (mirrors BankFile.licence). Missing / wrong value fails. */
export function checkEvalTextLicence(file: { licence?: unknown } | null | undefined, name = "eval"): Issue[] {
  if (typeof file?.licence !== "string" || file.licence !== BANK_TEXT_LICENCE) {
    return [{ level: "error", card: name, rule: "licence", msg: `licence must be ${BANK_TEXT_LICENCE}` }];
  }
  return [];
}

export interface BankFile { $comment?: string; topic_file: string; licence?: string; cards: BankCard[] }

export const LIMITS = { title_th: 40, answer_th: 800 } as const;
/** Cards older than this (months) produce a warning, not an error. */
export const STALE_MONTHS = 12;
export const ID_RE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.[a-z]?\d{3}$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PLACEHOLDER_MARK = "PLACEHOLDER";
/** URL shorteners are never allowed (the destination can change after review). */
export const SHORTENERS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "cutt.ly", "shorturl.at", "rebrand.ly", "is.gd", "lin.ee"];
export const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?|$)/i;

export interface BankContext {
  /** Phone numbers that exist in services.json (service phone channels and crisis lines). */
  phones: ReadonlySet<string>;
  /** Hostnames allowed for links (services.json sources plus the bank allow-list). */
  linkHosts: ReadonlySet<string>;
  /** Time ranges ("HH:MM–HH:MM") cited in services.json hours_sources, keyed by phone/handle. */
  hoursByContact: ReadonlyMap<string, ReadonlySet<string>>;
  /** Handles already public in services.json (e.g. "@teen_club"); everything else is PII-like. */
  handles: ReadonlySet<string>;
  copyStatus: "draft" | "reviewed";
  today?: string;
  /** Override the reviewed name-detector allowlist (tests). Production uses PII_NAME_ALLOWLIST. */
  nameAllowlist?: readonly { id: string; span: string; why: string }[];
}

export interface Issue { level: "error" | "warning"; card: string; rule: string; msg: string }

/** Phone numbers and hotlines in Thai text: 3–4 digit hotlines starting with 1, and 9–10 digit 0-prefixed numbers. */
export function phonesIn(text: string): string[] {
  const t = toArabic(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/(?<![\d:.\-])(1\d{2,3})(?![\d:.\-])/g)) out.add(m[1]);
  for (const span of findPhoneSpans(text)) {
    const digits = toArabic(span).replace(/\D/g, "");
    if (digits) out.add(digits);
  }
  return [...out];
}

/** Time ranges like "09:00–21:00", "9.00-21.00 น." normalised to "HH:MM–HH:MM", plus "24h" for "24 ชั่วโมง". */
export function hoursIn(text: string): string[] {
  const t = toArabic(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})[:.](\d{2})\s*(?:น\.)?\s*(?:-|–|—|ถึง)\s*(\d{1,2})[:.](\d{2})/g))
    out.add(`${m[1].padStart(2, "0")}:${m[2]}–${m[3].padStart(2, "0")}:${m[4]}`);
  if (/24\s*(?:ชั่วโมง|ชม\.?|hours?|h\b)/i.test(t)) out.add("24h");
  return [...out];
}

export function urlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"'<>)]+|(?<![\w/@.])(?:www\.)[^\s"'<>)]+|(?<![\w/@.])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|th|me|ly|gl|co|io|ee)(?:\/[^\s"'<>)]*)?/gi)].map((m) => m[0]);
}

export function hostOf(url: string): string {
  try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function toArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

const isStr = (x: unknown): x is string => typeof x === "string";
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

/** Shape check for one card. Returns errors only (no cross-card rules). */
export function checkShape(c: any): Issue[] {
  const id = safeCardId(c?.id);
  const out: Issue[] = [];
  const err = (rule: string, msg: string) => out.push({ level: "error", card: id, rule, msg: safeMsg(msg) });
  if (!c || typeof c !== "object") { err("shape", "card is not an object"); return out; }
  if (!isStr(c.id) || !ID_RE.test(c.id)) err("id", `id must match topic.slug.nnn (${ID_RE})`);
  if (!BANK_TOPICS.includes(c.topic)) err("topic", `topic must be one of ${BANK_TOPICS.join(", ")}`);
  if (!isStr(c.title_th) || !c.title_th.trim()) err("title_th", "title_th is required");
  else if (c.title_th.length > LIMITS.title_th) err("title_th", `title_th is ${c.title_th.length} chars (max ${LIMITS.title_th})`);
  if (!isStr(c.answer_th) || !c.answer_th.trim()) err("answer_th", "answer_th is required");
  else if (c.answer_th.length > LIMITS.answer_th) err("answer_th", `answer_th is ${c.answer_th.length} chars (max ${LIMITS.answer_th})`);
  if (c.variants_th !== undefined && !isStrArr(c.variants_th)) err("variants_th", "variants_th must be string[]");
  if (!isStrArr(c.key_facts)) err("key_facts", "key_facts must be string[]");
  if (!isStrArr(c.triggers)) err("triggers", "triggers must be string[]");
  if (!Array.isArray(c.next) || !c.next.every((n: any) => isStr(n?.label_th) && isStr(n?.card_id))) err("next", "next must be {label_th, card_id}[]");
  if (!isStrArr(c.source_intents)) err("source_intents", "source_intents must be string[]");
  if (!Array.isArray(c.source) || !c.source.every((s: any) => isStr(s?.by) && isStr(s?.url) && isStr(s?.title) && isStr(s?.checked))) err("source", "source must be {by, url, title, as_of?, checked}[]");
  const r = c.review;
  if (!r || !REVIEW_STATUSES.includes(r.status) || !(r.reviewer === null || isStr(r.reviewer)) || !(r.reviewed_on === null || isStr(r.reviewed_on))) err("review", "review must be {status, reviewer, reviewed_on, notes?}");
  if (!(c.last_reviewed === null || (isStr(c.last_reviewed) && ISO_DATE_RE.test(c.last_reviewed)))) err("last_reviewed", "last_reviewed must be an ISO date (YYYY-MM-DD) or null");
  if (!Array.isArray(c.flags) || !c.flags.every((f: any) => CARD_FLAGS.includes(f))) err("flags", `flags must be a subset of ${CARD_FLAGS.join(", ")}`);
  if (!c.referral || !["none", "soft", "strong"].includes(c.referral.offer) || !Array.isArray(c.referral.intents) || !c.referral.intents.every((i: any) => VALID_INTENTS.includes(i))) err("referral", "referral must be {offer: none|soft|strong, intents: Intent[]}");
  if (!Array.isArray(c.links) || !c.links.every((l: any) => isStr(l?.url) && isStr(l?.label_th))) err("links", "links must be {url, label_th}[]");
  if (c.age_min !== 15 && c.age_min !== 18) err("age_min", "age_min must be 15 or 18");
  if (typeof c.reword !== "boolean") err("reword", "reword must be boolean");
  if (!isStr(c.licence) || !c.licence.trim()) err("licence", "licence is required");
  if (c.placeholder !== undefined && typeof c.placeholder !== "boolean") err("placeholder", "placeholder must be boolean");
  return out;
}

/** Every user-visible string on a card (shown or spoken), including key facts and triggers. */
export function visibleStrings(c: BankCard): string[] {
  return [
    c.title_th, c.answer_th, ...(c.variants_th ?? []),
    ...c.key_facts, ...c.triggers,
    ...c.next.map((n) => n.label_th),
    ...c.links.map((l) => l.label_th),
  ];
}

const USER_FACING_KEYS = new Set([
  "title_th", "answer_th", "variants_th", "key_facts", "triggers", "label_th",
  "question", "question_th", "choices", "choice_th", "prompt_th", "hint_th", "body_th", "text_th",
]);
const CONTACT_PII = new Set(["phone", "email", "national_id", "line_id", "handle", "facebook", "fb_cdn_image"]);
const NAME_PII = new Set(["thai_name", "english_name"]);

function pathKey(seg: string): string {
  return seg.replace(/\[\d+\]/g, "");
}

function isUserFacingPath(p: string): boolean {
  return p.split(".").some((seg) => {
    const k = pathKey(seg);
    return USER_FACING_KEYS.has(k) || k.endsWith("_th");
  });
}

/** Every string (and number-as-string) on a value, with a JSON path. Used so new card fields are scanned automatically. */
export function* walkStrings(v: unknown, p = "$"): Generator<{ path: string; value: string }> {
  if (typeof v === "string") yield { path: p, value: v };
  else if (typeof v === "number" || typeof v === "bigint") yield { path: p, value: String(v) };
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* walkStrings(v[i], `${p}[${i}]`);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) yield* walkStrings(x, `${p}.${k}`);
  }
}

function safeCardId(id: unknown): string {
  if (!isStr(id) || !id) return "(no id)";
  return Object.keys(findPII(id)).length ? "[redacted]" : id;
}

function safeMsg(msg: string): string {
  return scrubPII(msg).text.split(REDACTED).join("[redacted]");
}

function safePath(p: string): string {
  return p.split(".").map((seg) => {
    const inner = seg.replace(/\[\d+\]/g, "");
    return Object.keys(findPII(inner)).length ? seg.replace(inner, "[redacted]") : seg;
  }).join(".");
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Full validation (plan §1). `cards` is the whole bank: cross-card rules (unique ids, next targets,
 * cycles) need all of it. Returns errors and warnings; callers fail on any error.
 */
export function validateBank(cards: BankCard[], ctx: BankContext): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], card: string, rule: string, msg: string) =>
    issues.push({ level, card: safeCardId(card), rule, msg: safeMsg(msg) });
  const shapeOk = new Set<BankCard>();
  for (const c of cards) { const s = checkShape(c); issues.push(...s); if (!s.length) shapeOk.add(c); }
  const ids = new Map<string, number>();
  for (const c of cards) if (isStr(c?.id)) ids.set(c.id, (ids.get(c.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) add("error", id, "unique_id", `id used ${n} times`);

  for (const c of cards) {
    if (!shapeOk.has(c)) continue;
    const text = [c.answer_th, ...(c.variants_th ?? []), ...c.key_facts, ...c.triggers];
    for (let i = 0; i < c.next.length; i++) if (!ids.has(c.next[i].card_id)) add("error", c.id, "next_exists", `next[${i}] target does not exist`);
    for (let i = 0; i < c.key_facts.length; i++) if (!c.answer_th.includes(c.key_facts[i])) add("error", c.id, "key_facts", `key fact at key_facts[${i}] is not in answer_th`);
    for (let vi = 0; vi < (c.variants_th ?? []).length; vi++) {
      for (let i = 0; i < c.key_facts.length; i++) {
        if (!(c.variants_th as string[])[vi].includes(c.key_facts[i])) add("error", c.id, "key_facts", `variant variants_th[${vi}] drops key fact at key_facts[${i}]`);
      }
    }
    // Phones: every number shown must be a real, cited one.
    const phones = new Set(text.flatMap(phonesIn));
    for (const p of phones) if (!ctx.phones.has(p)) add("error", c.id, "phone_in_services", `phone …${p.slice(-2)} is not in services.json`);
    if (phones.size && !c.flags.includes("hotline")) add("error", c.id, "hotline_flag", "card shows a phone number but is not flagged 'hotline'");
    // Hours: a time range must match what services.json cites for a contact on the same card.
    const hours = new Set(text.flatMap(hoursIn));
    if (hours.size && !c.flags.includes("hours")) add("error", c.id, "hours_flag", "card shows opening hours but is not flagged 'hours'");
    const contacts = [...phones, ...text.flatMap((t) => [...t.matchAll(/@[\w.]+/g)].map((m) => m[0].toLowerCase()))];
    for (const h of hours) {
      const ok = contacts.some((k) => ctx.hoursByContact.get(k)?.has(h));
      if (!ok) add("error", c.id, "hours_match_source", `hours ${h} do not match a cited source for a contact on this card`);
    }
    // Verbatim-only cards.
    if ((c.flags.includes("hotline") || c.flags.includes("legal")) && c.reword) add("error", c.id, "reword_false", "hotline and legal cards must be reword: false");
    // Medical/legal: a source and a reviewer before approved.
    if (c.review.status === "approved" && (c.flags.includes("medical") || c.flags.includes("legal"))) {
      if (!c.source.length) add("error", c.id, "medical_source", "approved medical/legal card needs a source");
      if (!c.review.reviewer || !c.review.reviewed_on) add("error", c.id, "medical_reviewer", "approved medical/legal card needs a reviewer and date");
    }
    if (c.review.status === "approved" && !c.flags.includes("pii_checked")) add("error", c.id, "pii_checked", "approved card must be flagged pii_checked");
    // Placeholders: clearly marked, never approved.
    if (c.placeholder) {
      if (!c.answer_th.includes(PLACEHOLDER_MARK)) add("error", c.id, "placeholder_mark", `placeholder card must say ${PLACEHOLDER_MARK} in answer_th`);
      if (c.review.status === "approved") add("error", c.id, "placeholder_approved", "placeholder cards can never be approved");
    }
    // Ship gate (copy reviewed → only approved, non-placeholder cards).
    if (ctx.copyStatus === "reviewed" && (c.review.status !== "approved" || c.placeholder)) add("error", c.id, "ship_gate", "THAI_COPY_STATUS is 'reviewed' but this card is not approved");
    // Links: allow-listed hosts only, no shorteners, no images; and no raw URLs in the text.
    for (const l of c.links) {
      const host = hostOf(l.url);
      if (SHORTENERS.includes(host)) add("error", c.id, "link_shortener", `shortened link ${host}`);
      else if (IMAGE_EXT.test(l.url)) add("error", c.id, "link_image", "image links are not allowed");
      else if (!ctx.linkHosts.has(host)) add("error", c.id, "link_allowlist", host ? `link host ${host} is not on the allow-list` : "link URL is not on the allow-list");
    }
    for (const { path, value } of walkStrings(c)) {
      // Dialogflow intent ids (topic.slug.nnn) and citation URLs are not user-facing copy.
      if (/\.url$/.test(path) || path === "$.id" || /\.source_intents(?:\[|$)/.test(path)) continue;
      if (urlsIn(value).length) add("error", c.id, "no_url_in_text", `URL in ${safePath(path)}`);
    }
    // PII: every string field is scanned. Draft/unreviewed user-facing copy uses the full detector
    // + stripPII. Approved pii_checked cards still fail on contact PII and on name-detector hits
    // that are not on the card-scoped allowlist (scripts/bank/pii-name-allowlist.mjs).
    // Metadata/citation fields, including source URLs, only report contact PII; URL path digits
    // are not phones.
    const handles = [...ctx.handles];
    const nameAllow = ctx.nameAllowlist ?? PII_NAME_ALLOWLIST;
    const reviewedCopy = c.review.status === "approved" && c.flags.includes("pii_checked") && !c.placeholder;
    for (const { path, value } of walkStrings(c)) {
      const hits = findPII(value, { allowHandles: handles }) as Record<string, string[]>;
      const citationUrl = /\.url$/.test(path) && /^https?:\/\//i.test(value);
      const user = isUserFacingPath(path);
      for (const cat of Object.keys(hits)) {
        if (citationUrl && cat === "phone") continue; // URL path digits, not a contact number
        if (NAME_PII.has(cat)) {
          if (!user) continue;
          if (reviewedCopy) {
            const leftover = (hits[cat] as string[]).filter((span) => !isAllowlistedNameSpan(c.id, span, nameAllow));
            if (!leftover.length) continue;
          }
          add("error", c.id, "pii", `PII (${cat}) in ${safePath(path)}`);
          continue;
        }
        if (!CONTACT_PII.has(cat) && (!user || reviewedCopy)) continue;
        add("error", c.id, "pii", `PII (${cat}) in ${safePath(path)}`);
      }
      if (user) {
        let masked = value;
        for (const hnd of ctx.handles) masked = masked.split(hnd).join("");
        if (reviewedCopy) {
          const spans = [...allowlistedSpans(c.id, nameAllow)].sort((a: string, b: string) => b.length - a.length);
          for (const span of spans) masked = masked.split(span).join("");
        }
        const norm = masked.replace(/\s+/g, " ").trim();
        if (stripPII(masked) !== norm) add("error", c.id, "pii", `text at ${safePath(path)} changes under stripPII`);
      }
    }
    if (c.last_reviewed && ctx.today && monthsBetween(c.last_reviewed, ctx.today) > STALE_MONTHS) add("warning", c.id, "stale", `last reviewed ${c.last_reviewed}`);
    if (c.referral.offer !== "none" && !c.referral.intents.length) add("error", c.id, "referral_intents", "a referral offer needs at least one intent");
    if (mustStayAge15(c) && c.age_min !== 15) add("error", c.id, "age_safety", "welcome, fallback, refusal, ending, crisis, redirect, hotline and service-referral cards must be age_min 15");
    if (c.age_min === 15) {
      for (const n of c.next) {
        const t = cards.find((x) => x.id === n.card_id);
        if (t && t.age_min === 18) add("warning", c.id, "age_safety", `15+ card links to 18+ card ${t.id}`);
      }
    }
  }
  // Cycles without an exit: a strongly connected group of cards where no card leaves the group,
  // offers a referral or ends the chat.
  for (const scc of stronglyConnected(cards.filter((c) => shapeOk.has(c)))) {
    const inGroup = new Set(scc.map((c) => c.id));
    const cyclic = scc.length > 1 || scc[0].next.some((n) => n.card_id === scc[0].id);
    if (!cyclic) continue;
    const exit = scc.some((c) => c.topic === "ending" || c.referral.offer !== "none" || c.next.some((n) => !inGroup.has(n.card_id)));
    if (!exit) add("error", scc.map((c) => c.id).join(","), "cycle_exit", "cards form a loop with no exit (no ending, referral or way out)");
  }
  return issues;
}

/** Tarjan's algorithm over next[] edges. */
function stronglyConnected(cards: BankCard[]): BankCard[][] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  let i = 0; const idx = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>(), st: string[] = [], out: BankCard[][] = [];
  const visit = (v: string) => {
    idx.set(v, i); low.set(v, i); i++; st.push(v); on.add(v);
    for (const n of byId.get(v)!.next) {
      if (!byId.has(n.card_id)) continue;
      if (!idx.has(n.card_id)) { visit(n.card_id); low.set(v, Math.min(low.get(v)!, low.get(n.card_id)!)); }
      else if (on.has(n.card_id)) low.set(v, Math.min(low.get(v)!, idx.get(n.card_id)!));
    }
    if (low.get(v) === idx.get(v)) {
      const g: BankCard[] = []; let w: string;
      do { w = st.pop()!; on.delete(w); g.push(byId.get(w)!); } while (w !== v);
      out.push(g);
    }
  };
  for (const c of cards) if (!idx.has(c.id)) visit(c.id);
  return out;
}

/** Can this card be shown to this age band right now? */
export function shippable(c: BankCard, copyStatus: "draft" | "reviewed"): boolean {
  if (c.review.status === "rejected") return false;
  if (copyStatus === "reviewed") return c.review.status === "approved" && !c.placeholder;
  return true; // draft build: draft, in_review and approved cards show, labelled DRAFT/PLACEHOLDER in the UI
}

function mustStayAge15(c: BankCard): boolean {
  if (c.id === "general.welcome.000" || c.id === "general.fallback.000" || c.id === AGE_REDIRECT_ID) return true;
  if (c.id.startsWith("general.refusal_")) return true;
  if (c.topic === "ending") return true;
  if (/crisis|referral/.test(c.id)) return true;
  if (c.flags.includes("hotline")) return true;
  if (c.referral.offer !== "none") return true;
  return false;
}

/** Content of an 18+ card may only be shown to an explicit 18+ pick. */
export function ageAllowed(c: BankCard, ageBand: AgeState): boolean {
  return ageAllowedFor(c, ageBand);
}

/** Flatten bank files into cards (throws on a file without a cards array). */
export function cardsFromFiles(files: Record<string, unknown>): BankCard[] {
  const out: BankCard[] = [];
  for (const [name, f] of Object.entries(files)) {
    const file = (f as any)?.default ?? f;
    if (/quiz\.json$/.test(name)) continue;
    if (!file || !Array.isArray((file as BankFile).cards)) throw new Error(`bank file ${name} has no cards[]`);
    out.push(...(file as BankFile).cards);
  }
  return out;
}
