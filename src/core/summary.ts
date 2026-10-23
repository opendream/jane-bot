import type { AgeBand, Intent, Service } from "./types";
import { INTENT_LABEL_TH } from "./referral";

/** Max characters kept from her own words (≈ one line). */
export const MAX_NEED_CHARS = 140;

const REDACTED = "[ลบข้อมูลส่วนตัว]";

/**
 * Remove anything that could identify her: phone numbers, emails, LINE/IG/FB handles, URLs,
 * long digit runs, names after "ชื่อ", schools, addresses. Conservative on purpose.
 * Short numbers (1–2 digits, e.g. "2 อาทิตย์", "17 ปี") are kept.
 */
/** Thai digits ๐-๙ → ASCII 0-9. Length-preserving so match indices map back to the original. */
export function toArabicDigits(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

/** Apply `re` to the arabic-normalised form and replace the matching original spans. */
function replaceOnArabic(input: string, re: RegExp, repl: string): string {
  const s = toArabicDigits(input);
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let out = "";
  let last = 0;
  for (const m of s.matchAll(rx)) {
    const start = m.index ?? 0;
    out += input.slice(last, start) + repl;
    last = start + m[0].length;
  }
  return out + input.slice(last);
}

export function stripPII(input: string): string {
  let s = input;
  const rules: [RegExp, string][] = [
    [/https?:\/\/\S+|www\.\S+/gi, REDACTED],
    [/[\w.+-]+@[\w-]+\.[\w.]+/g, REDACTED],                          // email
    [/(?:\+?66[\s.\-]*0?[\s.\-]*|0[\s.\-]*)\d(?:[\s.\-]*\d){7,8}/g, REDACTED], // Thai mobile/landline, any grouping
    [/\d[\d\s-]{4,}\d/g, REDACTED],                                    // any long digit run (ID, phone); no dots — those are times like 10.00-20.00
    [/(?<![A-Za-z])(?:ไลน์|ไอดีไลน์|line\s*id|line|ig|ไอจี|เฟส|facebook|fb)(?![A-Za-z])\s*[:：]?\s*@?[\w.\-]+/gi, REDACTED],
    [/@[\w.\-]{2,}/g, REDACTED],                                       // any handle
    [/(?<!เ)(?:ชื่อเล่น|ชื่อจริง|ชื่อ|นามสกุล)\s*(?:คือ|ว่า)?\s*[^\s,.!?]+/g, REDACTED],  // (?<!เ): not "เชื่อ"
    [/(?:my name is|i am called|i'm called)\s+\S+/gi, REDACTED],
    [/(?:โรงเรียน|ร\.ร\.|รร\.|มหาวิทยาลัย|ม\.\s?[ก-๙A-Za-z]{2,}|วิทยาลัย)\s*[^\s,.!?]*/g, REDACTED],
    [/(?:บ้านเลขที่|เลขที่|หมู่บ้าน|หมู่ที่|ซอย|ซ\.|ถนน|ถ\.|ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต)\s*[^\s,.!?]+/g, REDACTED],
  ];
  for (const [re, rep] of rules) s = replaceOnArabic(s, re, ` ${rep} `);
  return s.replace(new RegExp(`(?:${escape(REDACTED)}\\s*)+`, "g"), REDACTED + " ").replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

function escape(x: string) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export const WANT_TH: Record<Intent, string> = {
  pregnancy: "อยากคุยกับเจ้าหน้าที่เรื่องการตรวจครรภ์และทางเลือก",
  emergency_contraception: "อยากรู้ว่าควรทำอย่างไรต่อและหายาคุมฉุกเฉินได้ที่ไหน",
  contraception: "อยากได้คำแนะนำเรื่องวิธีคุมกำเนิดที่เหมาะกับตัวเอง",
  sti_hiv: "อยากรู้ว่าควรตรวจอะไรและตรวจได้ที่ไหนแบบเป็นความลับ",
  relationship_consent: "อยากคุยกับคนที่เข้าใจเรื่องความสัมพันธ์และการปฏิเสธ",
  mental_health: "อยากมีคนรับฟังและช่วยคิดว่าจะทำอย่างไรต่อ",
  violence: "อยากได้ความช่วยเหลือและคำแนะนำว่าจะปลอดภัยได้อย่างไร",
  other: "อยากคุยกับเจ้าหน้าที่",
};

const AGE_TH: Record<AgeBand, string> = {
  "15-17": "15–17 ปี", "18-24": "18–24 ปี", "25+": "25 ปีขึ้นไป", unspecified: "ไม่ระบุ",
};

export interface SummaryInput {
  service: Service;
  needText: string;
  intent: Intent;
  ageBand: AgeBand;
}

export function preferredChannel(service: Service): string {
  const t = service.channels[0]?.type;
  return t === "phone" ? "โทรศัพท์" : t === "line" ? "แชท LINE" : t === "facebook" ? "แชทเฟซบุ๊ก" : "ออนไลน์";
}

/** Shorten on a word-ish boundary (Thai has no spaces, so fall back to a hard cut). */
export function clip(s: string, max = MAX_NEED_CHARS): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + "…";
}

/** Deterministic template summary (spec §4.5). The model may later rephrase, never add facts. */
export function draftSummary({ service, needText, intent, ageBand }: SummaryInput): string {
  const need = clip(stripPII(needText)) || INTENT_LABEL_TH[intent];
  return [
    `ถึงเจ้าหน้าที่ ${service.name_th}`,
    `- เรื่องที่อยากปรึกษา: ${need}`,
    `- ช่วงอายุ: ${AGE_TH[ageBand]}`,
    `- สิ่งที่อยากได้: ${WANT_TH[intent]}`,
    `- ช่องทางที่สะดวก: ${preferredChannel(service)}`,
    `(สรุปนี้ผู้ใช้อ่านและยืนยันเองแล้ว)`,
  ].join("\n");
}

/** Final pass on whatever the user approves (she may have typed PII into the editor). */
export function finalizeSummary(edited: string): string {
  return edited.split("\n").map((l) => (l.startsWith("ถึงเจ้าหน้าที่") ? l : stripPII(l))).join("\n").trim();
}
