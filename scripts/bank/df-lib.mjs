// Dialogflow (ES) export → normalised, merged, scrubbed review queue (plan §2).
// Node only, no dependencies. Pure functions plus readExport(); the CLI is import-df.mjs.
// Nothing here prints export text. Output goes to a staging dir OUTSIDE the repo.
import fs from "node:fs";
import path from "node:path";
import { scrubPII, findPII } from "./pii-patterns.mjs";

/* ----------------------------------------- read ----------------------------------------- */

/** Read one export dir (agent.json + intents/*.json + intents/*_usersays_<lang>.json). */
export function readExport(dir, label) {
  const idir = path.join(dir, "intents");
  if (!fs.existsSync(path.join(dir, "agent.json")) || !fs.existsSync(idir)) throw new Error(`${label}: not a Dialogflow export (agent.json + intents/)`);
  const files = fs.readdirSync(idir).filter((f) => f.endsWith(".json"));
  const intents = new Map();
  for (const f of files.filter((f) => !/_usersays_[a-z-]+\.json$/i.test(f))) {
    const j = JSON.parse(fs.readFileSync(path.join(idir, f), "utf8"));
    const base = f.slice(0, -5);
    const us = files.filter((u) => u.startsWith(`${base}_usersays_`)).flatMap((u) => JSON.parse(fs.readFileSync(path.join(idir, u), "utf8")));
    intents.set(j.name, { intent: j, usersays: us });
  }
  return { label, intents };
}

/* --------------------------------------- normalise --------------------------------------- */

/** Phrase key for de-duplication: NFC, zero-width removed, lower case, ALL whitespace removed (Thai spacing is arbitrary). */
export const normPhrase = (s) => String(s).normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").toLowerCase().replace(/\s+/g, "");
const MSG_TYPE = { 0: "text", 1: "card", 2: "quick_replies", 3: "image", 4: "custom_payload" };

/** One intent → a flat record. Responses keep platform and type so payloads can be counted and dropped. */
export function normalizeIntent(name, { intent: j, usersays }) {
  const phrases = usersays.map((u) => (u.data ?? []).map((d) => d.text).join("")).filter((p) => p.trim());
  const messages = [];
  for (const r of j.responses ?? []) for (const m of r.messages ?? []) {
    messages.push({
      platform: m.platform ?? "default", type: MSG_TYPE[String(m.type)] ?? String(m.type),
      speech: m.speech == null ? [] : Array.isArray(m.speech) ? m.speech : [m.speech],
      replies: m.replies ?? [], title: m.title ?? "", subtitle: m.subtitle ?? "",
      imageUrl: m.imageUrl ?? "", buttons: (m.buttons ?? []).map((b) => ({ text: b.text ?? "", postback: b.postback ?? "" })),
      payload: m.payload ?? null,
    });
  }
  return {
    name, phrases,
    inputContexts: j.contexts ?? [],
    outputContexts: (j.responses ?? []).flatMap((r) => (r.affectedContexts ?? []).map((c) => c.name)),
    parentId: j.parentId ?? null, id: j.id ?? null,
    action: (j.responses ?? [])[0]?.action ?? "",
    webhook: !!j.webhookUsed, fallback: !!j.fallbackIntent, endInteraction: !!j.endInteraction,
    events: (j.events ?? []).map((e) => e.name),
    messages,
  };
}

/* ----------------------------------------- merge ----------------------------------------- */

const stable = (v) => JSON.stringify(v);
const respKey = (rec) => stable(rec.messages);
const phraseSet = (rec) => new Set(rec.phrases.map(normPhrase));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Union by intent name (plan §2 rules a–e):
 *  (a) identical → one record; (b) same name, different responses → conflict, both kept;
 *  (c) same name, different phrases → union; (d) phrase in several context-free intents → phrase_conflict;
 *  (e) context-dependent duplicates are kept, scoped to their parent.
 */
export function mergeExports(bot, jane) {
  const names = new Set([...bot.intents.keys(), ...jane.intents.keys()]);
  const merged = [];
  const stats = { bot: bot.intents.size, jane: jane.intents.size, unique: 0, overlap: 0, identical: 0, conflicts: [], phraseDiffOnly: [], botOnly: 0, janeOnly: [] };
  for (const name of [...names].sort()) {
    const a = bot.intents.has(name) ? normalizeIntent(name, bot.intents.get(name)) : null;
    const b = jane.intents.has(name) ? normalizeIntent(name, jane.intents.get(name)) : null;
    let rec;
    if (a && b) {
      stats.overlap++;
      const sameResp = respKey(a) === respKey(b);
      const samePh = sameSet(phraseSet(a), phraseSet(b));
      if (sameResp && samePh) stats.identical++;
      if (!sameResp) stats.conflicts.push(name);
      else if (!samePh) stats.phraseDiffOnly.push(name);
      const seen = new Set(); const phrases = [];
      for (const p of [...a.phrases, ...b.phrases]) { const k = normPhrase(p); if (!seen.has(k)) { seen.add(k); phrases.push(p); } }
      rec = { ...a, phrases, origin: ["bot", "jane"], conflict: !sameResp, variants: sameResp ? null : { bot: a.messages, jane: b.messages } };
    } else if (a) { stats.botOnly++; rec = { ...a, origin: ["bot"], conflict: false, variants: null }; }
    else { stats.janeOnly.push(name); rec = { ...b, origin: ["jane"], conflict: false, variants: null }; }
    merged.push(rec);
  }
  stats.unique = merged.length;
  // (d)/(e): phrases shared by several intents.
  const byPhrase = new Map();
  for (const r of merged) for (const p of new Set(r.phrases.map(normPhrase))) { if (!byPhrase.has(p)) byPhrase.set(p, []); byPhrase.get(p).push(r); }
  const multi = [...byPhrase.entries()].filter(([, rs]) => rs.length > 1);
  const ctxFree = (r) => !r.inputContexts.length;
  const phraseConflicts = multi.filter(([, rs]) => rs.filter(ctxFree).length > 1);
  for (const r of merged) r.phraseConflicts = [];
  for (const [, rs] of phraseConflicts) for (const r of rs.filter(ctxFree)) r.phraseConflicts.push(rs.filter((x) => x !== r && ctxFree(x)).map((x) => x.name));
  stats.multiIntentPhrases = multi.length;
  stats.phraseConflicts = phraseConflicts.length;
  stats.uniquePhrases = byPhrase.size;
  return { merged, stats };
}

/* ----------------------------------- strip payloads/links ----------------------------------- */

export const SHORTENER_HOSTS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "cutt.ly", "shorturl.at", "rebrand.ly", "is.gd", "lin.ee", "m.me", "fb.me"];
export const IMAGE_HOSTS = /(?:fbcdn\.net|fbsbx\.com|giphy\.com|tenor\.com|imgur\.com)$/i;
/** Link hosts that may survive as candidates for re-checking (everything else is dropped). */
export const LINK_CANDIDATE_HOSTS = ["rsathai.org", "rh.anamai.moph.go.th", "dmh.go.th", "aidsid.or.th", "th.aidsid.or.th", "nhso.go.th"];
export const URL_RE = /https?:\/\/[^\s"'<>)]+|(?<![\w/@.])(?:www\.|m\.me\/|bit\.ly\/|tinyurl\.com\/|line\.me\/|fb\.me\/|goo\.gl\/)[^\s"'<>)]+/gi;

const hostOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

/** Remove every URL from a string; keep allow-listed ones as candidates. */
export function stripLinks(s, counts) {
  const candidates = [];
  const text = String(s).replace(URL_RE, (u) => {
    const h = hostOf(u);
    if (SHORTENER_HOSTS.includes(h)) counts.shortLinks++;
    else if (IMAGE_HOSTS.test(h) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u)) counts.imageLinks++;
    else if (/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(h)) counts.facebookLinks++;
    else if (LINK_CANDIDATE_HOSTS.includes(h)) { candidates.push(u); counts.linkCandidates++; }
    else counts.otherLinks++;
    return " ";
  }).replace(/\s+/g, " ").trim();
  return { text, candidates };
}

/**
 * Keep text responses (any platform, de-duplicated) and quick-reply labels (→ chips).
 * Drop cards, images, custom payloads, buttons and postbacks; strip links. Counts what was dropped.
 */
export function cleanMessages(messages) {
  const counts = { fbPayloads: 0, linePayloads: 0, cards: 0, images: 0, customPayloads: 0, buttons: 0, shortLinks: 0, imageLinks: 0, facebookLinks: 0, otherLinks: 0, linkCandidates: 0 };
  const texts = [], chips = [], links = [];
  const seenT = new Set(), seenC = new Set();
  for (const m of messages) {
    if (m.platform === "facebook") counts.fbPayloads++;
    if (m.platform === "line") counts.linePayloads++;
    if (m.type === "card") {
      counts.cards++; counts.buttons += m.buttons.length; if (m.imageUrl) counts.images++;
      for (const b of m.buttons) stripLinks(b.postback, counts); // count the links we drop with the card
      continue;
    }
    if (m.type === "image") { counts.images++; continue; }
    if (m.type === "custom_payload" || m.payload) { counts.customPayloads++; continue; }
    if (m.type === "quick_replies") {
      for (const r of m.replies) { const { text } = stripLinks(r, counts); if (text && !seenC.has(text)) { seenC.add(text); chips.push(text); } }
      continue;
    }
    for (const sp of m.speech) {
      const { text, candidates } = stripLinks(sp, counts);
      links.push(...candidates);
      if (text && !seenT.has(text)) { seenT.add(text); texts.push(text); }
    }
  }
  return { texts, chips, links: [...new Set(links)], counts };
}

/* ------------------------------------- medical/legal flags ------------------------------------- */

/** Same categories as the 22 Oct scan (plan §0). A hit means "needs medical/legal review", not "wrong". */
export const MEDICAL_FLAGS = {
  prep_pep: /prep|pep|เพร็พ|เพร็ป|เป๊ป|เพ็พ|ยาต้านก่อน|ยาต้านหลัง|ยาต้านฉุกเฉิน/i,
  hiv_treatment_testing: /hiv|เอชไอวี|เอดส์|ยาต้านไวรัส|u=u|ตรวจเลือด/i,
  emergency_contraception: /ยาคุมฉุกเฉิน|ยาเม็ดคุมกำเนิดฉุกเฉิน|postinor|โพสตินอร์|มาดอนน่า|72\s*(ชม|ชั่วโมง)|120\s*(ชม|ชั่วโมง)|urgent/i,
  contraception_dosing: /ยาคุม|ฝังยา|ยาฉีด|ห่วงอนามัย|iud|\d+\s*(เม็ด|mg|มก|มิลลิกรัม)/i,
  hpv_vaccine: /hpv|เอชพีวี|มะเร็งปากมดลูก|วัคซีน/i,
  abortion_law: /ทำแท้ง|แท้ง|ยุติการตั้งครรภ์|ผิดกฎหมาย|กฎหมาย|มาตรา|สัปดาห์/i,
  sti_treatment: /หนองใน|ซิฟิลิส|เริม|หูด|โกโนเรีย|gonorr|syphilis|herpes|ยาปฏิชีวนะ/i,
  hotline_numbers: /(?<!\d)(1663|1323|1300|1669|191|1387|1556|1155|1330)(?!\d)/,
  hours_or_times: /\d{1,2}[.:]\d{2}\s*(น\.|-|–)|เปิด\s*\d|ทุกวัน|24\s*(ชม|ชั่วโมง)/,
  legal_age_consent: /อายุ(ต่ำกว่า|ไม่ถึง|ครบ)?\s*(15|18|20)|พราก|กระทำชำเรา|ผู้เยาว์/,
  prices_baht: /\d+\s*บาท/,
  dated_year_ref: /(?<!\d)(25[5-6]\d|20[12]\d)(?!\d)/,
};
/** Name patterns that are always reviewed (abortion info clashes with the no-method-instructions rule). */
export const NAME_FLAGS = { abortion_info: /^info\.how_abort\.|^pregnancy\.abortion\./ };

/** Every response string, including card titles, subtitles, quick replies and buttons (for flags only). */
export function allResponseStrings(messages) {
  return messages.flatMap((m) => [...m.speech, m.title, m.subtitle, ...m.replies, ...m.buttons.flatMap((b) => [b.text, b.postback])]).filter(Boolean);
}

export function medicalFlags(name, texts) {
  const t = texts.join(" ");
  const f = Object.entries(MEDICAL_FLAGS).filter(([, re]) => re.test(t)).map(([k]) => k);
  for (const [k, re] of Object.entries(NAME_FLAGS)) if (re.test(name)) f.push(k);
  return f;
}

/** Card flags (bank schema) implied by the review flags. */
export function cardFlagsFor(medical) {
  const out = new Set(["fb_payload_removed"]);
  if (medical.some((f) => ["prep_pep", "hiv_treatment_testing", "emergency_contraception", "contraception_dosing", "hpv_vaccine", "sti_treatment"].includes(f))) out.add("medical");
  if (medical.some((f) => ["abortion_law", "legal_age_consent", "abortion_info"].includes(f))) out.add("legal");
  if (medical.includes("hotline_numbers")) out.add("hotline");
  if (medical.includes("hours_or_times")) out.add("hours");
  if (medical.includes("prices_baht")) out.add("price");
  return [...out];
}

/* ---------------------------------------- queue ---------------------------------------- */

/** Topic guess from the intent name (groups overlap; first match wins). Reviewers can change it. */
export function topicFor(name) {
  const n = name.toLowerCase();
  if (/^20200708\.|urgent|ฉุกเฉิน|emergency/.test(n)) return "emergency_contraception";
  if (/disease|hiv|prep|pep|sti/.test(n)) return "sti_hiv";
  if (/birth|pill|condom|contracep|iud|implant|patch|inject/.test(n)) return "contraception";
  if (/pregnan|abort|period/.test(n)) return "pregnancy";
  if (/consent|harass|relation/.test(n)) return "relationship_consent";
  if (/mood|sad|stress|lonely|mental/.test(n)) return "mental_health";
  if (/ending|bye|talkadmin|talktojane/.test(n)) return "ending";
  if (/default|welcome|fallback/.test(n)) return "general";
  return "other";
}

/**
 * One queue item per merged intent. Status is always "needs-review"; text is PII-scrubbed;
 * the proposed card is a draft skeleton with EMPTY triggers (triggers are newly written, never copied).
 */
export function toQueueItem(rec, scrubOpts = {}) {
  const pii = { categories: new Set(), count: 0 };
  const scrub = (s) => { const r = scrubPII(s, scrubOpts); r.categories.forEach((c) => pii.categories.add(c)); pii.count += r.categories.length; return r.text; };
  const clean = cleanMessages(rec.messages);
  const texts = clean.texts.map(scrub), chips = clean.chips.map(scrub);
  const variants = rec.variants ? Object.fromEntries(Object.entries(rec.variants).map(([k, ms]) => [k, cleanMessages(ms).texts.map(scrub)])) : null;
  const medical = medicalFlags(rec.name, allResponseStrings(rec.messages));
  const flags = cardFlagsFor(medical);
  return {
    queue_id: `df:${rec.name}`,
    intent: rec.name,
    origin: rec.origin,
    status: "needs-review",
    review: { medical_review: medical.length > 0, medical_flags: medical, pii_check: pii.count > 0 ? "hits-redacted" : "no-hits-sample-10pct", conflict: rec.conflict, phrase_conflicts: rec.phraseConflicts?.length ?? 0 },
    context: { input: rec.inputContexts, output: rec.outputContexts, parent: !!rec.parentId, end: rec.endInteraction, webhook: rec.webhook, fallback: rec.fallback },
    stripped: clean.counts,
    pii: { categories: [...pii.categories], count: pii.count },
    responses_th: texts,
    conflict_variants: variants,
    chips_th: chips,
    link_candidates: clean.links,
    proposed_card: {
      id: null, topic: topicFor(rec.name), title_th: "", answer_th: texts[0] ?? "", key_facts: [], triggers: [],
      next: [], source_intents: [rec.name], source: [], review: { status: "draft", reviewer: null, reviewed_on: null },
      last_reviewed: null, flags, referral: { offer: "soft", intents: [] }, links: [], age_min: 15,
      reword: !(flags.includes("hotline") || flags.includes("legal")), licence: "CC-BY-SA-4.0",
    },
  };
}

/** PII hits with text, for the human check (staging only, mode 0600). */
export function piiHits(rec, scrubOpts = {}) {
  const out = [];
  const strings = [...rec.phrases.map((s) => ["phrase", s]), ...cleanMessages(rec.messages).texts.map((s) => ["response", s])];
  for (const [field, s] of strings) for (const [cat, ms] of Object.entries(findPII(s, scrubOpts))) out.push({ intent: rec.name, field, category: cat, matches: ms });
  return out;
}
