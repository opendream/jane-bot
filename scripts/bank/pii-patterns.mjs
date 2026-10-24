// PII patterns for the answer bank (shared by the importer scrub and the committed-bank PII test).
// Ported from the read-only scan of 22 Oct 2026 (categories in the build plan §0). Plain JS so Node
// scripts and Vitest can both import it. Patterns only; no data from the exports lives here.

/** Thai honorific or "name is" followed by a Thai word. */
export const THAI_NAME = /(?:ชื่อ(?:จริง|เล่น)?\s*(?:ว่า|คือ)?\s*[ก-๙]{2,}|(?:นาย|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*[ก-๙]{2,})/g;
/** "name is" phrases that are generic (questions, persona, pronouns) rather than a person's name. */
export const THAI_NAME_GENERIC = /^(?:ชื่อ(?:จริง|เล่น)?\s*(?:ว่า|คือ)?\s*)(?:อะไร|ไร|เจน|พี่เจน|หนู|เรา|ผม|ฉัน|ตัวเอง|นี้|นั้น|เสีย|ยา|โรค|เล่น|จริง|ของ|ใน|เต็ม|ที่|คุณ|เค้า|เขา|ว่า|บริการ|สายด่วน|หน่วยงาน|เพจ)/;
/** "นาย" used as a pronoun ("you"), not an honorific. */
export const NAI_PRONOUN = /^นาย\s*(?:เป็น|ชื่อ|คือ|ทำ|จะ|อยู่|ไป|มี|ชอบ|รู้|เคย|ไม่|ก็|ได้|อะ|ว่า|นี่|น่ะ|ช่วย|อายุ|กิน|แก่|โง่|บ้า|ตอบ|ใช่|หรือ|คิด|เห็น|เข้าใจ)/;
/** English "my name is X" and capitalised non-dictionary words (candidates only). */
export const ENGLISH_NAME_PHRASE = /\b(?:my name is|i am called|i'm called|call me)\s+[A-Z][a-z]+/gi;
export const ENGLISH_CAPITALISED = /\b[A-Z][a-z]{2,}\b/g;
export const ENGLISH_ALLOW = new Set(("Jane Dialogflow Facebook Messenger Line Google Android Ios Judies Game Yes Dear Hiv Prep Pep Condom The You Sex Safe Bot " +
  "Instagram Twitter Youtube Tiktok Valentine Love Pill Emergency Ok Okay Hello Thank Thanks Hpv Iud Lgbt Lgbtq Hi Hey Bye No Not What How Why " +
  "When Where Who Is Are Do Does Can Gay Lesbian Bisexual Trans Transgender App Store Play Apple Day Covid Unicef Unfpa Thai Thailand Bangkok " +
  "English Doctor Demo Placeholder Online Club Teen Rsa Yfhs General Information Not Medical Advice Qwen Webgpu Wasm Opendream Thaihealth")
  .toLowerCase().split(/\s+/));

/** A single dot/hyphen with optional spaces around it, or just whitespace, between digit groups. */
const DSEP = String.raw`(?:\s*[.\-]\s*|\s+)`;
/** Thai mobile: 10 digits starting 06/08/09. Optional +66 / 66, with or without a trunk 0. */
export const PHONE_MOBILE = new RegExp(String.raw`(?<!\d)(?:\+?66${DSEP}?0?${DSEP}?|0${DSEP}?)[689](?:${DSEP}?\d){8}(?!\d)`, "g");
/** Thai landline: 9 digits starting 0[2-7]. Optional +66 / 66. */
export const PHONE_LANDLINE = new RegExp(String.raw`(?<!\d)(?:\+?66${DSEP}?0?${DSEP}?|0${DSEP}?)[2-7](?:${DSEP}?\d){7}(?!\d)`, "g");
/** HH:MM / HH.MM that is not part of a longer dotted number (08.12.34… or 08.1234…). */
export const TIME_TOKEN = /(?<![\d.])\d{1,2}[:.]\d{2}(?![\d.])/g;
/** A time range "09.00-21.00", "9:00–21:00 น.", "๐๙.๐๐ ถึง ๒๑.๐๐". */
export const TIME_RANGE = /(?<!\d)\d{1,2}[:.]\d{2}\s*(?:น\.)?\s*(?:[-–—]|ถึง)\s*\d{1,2}[:.]\d{2}(?!\d)/g;

/** Replace clock times / ranges with same-length spaces so match indices still map to the original. */
export function blankTimes(s) {
  return String(s ?? "")
    .replace(new RegExp(TIME_RANGE.source, "g"), (m) => " ".repeat(m.length))
    .replace(new RegExp(TIME_TOKEN.source, "g"), (m) => " ".repeat(m.length));
}
export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
export const LINE_ID = /(?:line\s*(?:id)?|ไลน์\s*(?:ไอดี)?|ไอดีไลน์)\s*[:：]?\s*@?[a-z0-9._-]{3,}/gi;
export const AT_HANDLE = /(?<![\w.])@[a-z0-9._]{3,}/gi;
export const FB_REF = /(?:facebook\.com\/|fb\.com\/|fb\.me\/|m\.me\/|fb\.watch\/|เฟส(?:บุ๊[กค])?\s*[:：]?\s*[a-z])/gi;
export const FACEBOOK_URL = /(?:https?:\/\/)?(?:[\w-]+\.)?(?:facebook\.com|fb\.com|fb\.me|m\.me)\/\S*/gi;
/** Facebook CDN image hosts (scontent*.fbcdn.net, *.fbsbx.com, lookaside.fbsbx.com). */
export const FB_CDN_URL = /(?:https?:\/\/)?[\w.-]*(?:fbcdn\.net|fbsbx\.com)\/\S*/gi;
/** 13-digit Thai national ID, any grouping. */
export const NATIONAL_ID = /(?<!\d)\d[\s.-]?\d{4}[\s.-]?\d{5}[\s.-]?\d{2}[\s.-]?\d(?!\d)/g;
export const ADDRESS = /(?:บ้านเลขที่|เลขที่\s*\d|ซอย\s*[ก-๙\d]|ซ\.\s*[ก-๙\d]|ถนน[ก-๙]|ถ\.\s*[ก-๙]|หมู่(?:ที่)?\s*\d|แขวง[ก-๙]|ตำบล[ก-๙]|อำเภอ[ก-๙]|(?<!\d)\d{5}(?!\d))/g;
export const SCHOOL = /(?:โรงเรียน\s*[ก-๙]{2,}|ร\.ร\.\s*[ก-๙]|มหาวิทยาลัย\s*[ก-๙]{2,})/g;

/** Thai digits ๐-๙ → ASCII 0-9. Length-preserving (1:1), so match indices map back to the original. */
export function toArabic(s) {
  return String(s ?? "").replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

/** Last two digits, or [redacted]. Never the full value. */
export function maskPII(value) {
  const digits = toArabic(value).replace(/\D/g, "");
  return digits.length >= 2 ? `…${digits.slice(-2)}` : "[redacted]";
}

/** Thai national ID checksum (mod 11). */
export function nationalIdChecksumOk(digits) {
  const d = toArabic(digits).replace(/\D/g, "").split("").map(Number);
  if (d.length !== 13) return false;
  const sum = d.slice(0, 12).reduce((a, x, i) => a + x * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === d[12];
}

/** Match `re` on arabic-normalised text; return the original-text spans (Thai digits kept). */
function all(re, original) {
  const src = String(original ?? "");
  const s = toArabic(src);
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  return [...s.matchAll(rx)].map((m) => src.slice(m.index, m.index + m[0].length));
}

/** Phone spans in the original text. Times / time ranges are blanked first so "09.00-21.00 10.00-20.00" is not a number. */
export function findPhoneSpans(original) {
  const src = String(original ?? "");
  const s = blankTimes(toArabic(src));
  const out = [];
  for (const re of [PHONE_MOBILE, PHONE_LANDLINE]) {
    for (const m of s.matchAll(new RegExp(re.source, "g"))) {
      out.push(src.slice(m.index, m.index + m[0].length));
    }
  }
  return out;
}

/**
 * Category → matches for one string. Name candidates drop the known generic forms.
 * `opts.allowHandles` lets service handles that are already in services.json (e.g. "@teen_club") pass.
 * Matches are original spans (Thai numerals preserved) so scrub/strip cover the source text.
 */
export function findPII(text, opts = {}) {
  const s = String(text ?? "");
  const allow = new Set((opts.allowHandles ?? []).map((x) => x.toLowerCase()));
  const out = {};
  const put = (k, arr) => { if (arr.length) out[k] = arr; };
  put("thai_name", all(THAI_NAME, s).filter((m) => !THAI_NAME_GENERIC.test(m) && !NAI_PRONOUN.test(m)));
  put("english_name", [...all(ENGLISH_NAME_PHRASE, s), ...all(ENGLISH_CAPITALISED, s).filter((w) => !ENGLISH_ALLOW.has(w.toLowerCase()))]);
  put("phone", findPhoneSpans(s));
  put("email", all(EMAIL, s));
  put("line_id", all(LINE_ID, s).filter((m) => !allow.has(m.replace(/^.*?(@?[a-z0-9._-]{3,})$/i, "$1").toLowerCase())));
  put("handle", all(AT_HANDLE, s).filter((m) => !allow.has(m.toLowerCase())));
  put("facebook", [...new Set([...all(FB_REF, s), ...all(FACEBOOK_URL, s)])]);
  put("fb_cdn_image", all(FB_CDN_URL, s));
  put("national_id", all(NATIONAL_ID, s).filter((m) => toArabic(m).replace(/\D/g, "").length === 13));
  put("address", all(ADDRESS, s));
  put("school", all(SCHOOL, s));
  return out;
}

export const REDACTED = "[ลบข้อมูลส่วนตัว]";

/** Redact every finding (importer staging copy only). Returns the text and the categories hit. */
export function scrubPII(text, opts = {}) {
  const hits = findPII(text, opts);
  let s = String(text ?? "");
  const found = Object.values(hits).flat().sort((a, b) => b.length - a.length);
  for (const m of found) s = s.split(m).join(REDACTED);
  return { text: s, categories: Object.keys(hits) };
}
