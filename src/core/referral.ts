import type { Intent, Service, CrisisLine } from "./types";
import { openStatus, type OpenStatus } from "./openNow";
import { MAX_SUGGESTIONS } from "../config";
import data from "../data/services.json";

export const SERVICES = data.services as unknown as Service[];
export const CRISIS_LINES = data.crisis_lines as unknown as CrisisLine[];
export const DATA_VERSION = data.data_version;

/** Preferred services per need, best first. */
export const PREFERENCE: Record<Intent, string[]> = {
  pregnancy: ["hotline_1663", "teen_club", "tamtang", "rsa_online"],
  emergency_contraception: ["hotline_1663", "teen_club", "yfhs"],
  contraception: ["teen_club", "hotline_1663", "yfhs"],
  sti_hiv: ["hotline_1663", "yfhs", "teen_club"],
  relationship_consent: ["teen_club", "hotline_1323", "hotline_1300"],
  mental_health: ["hotline_1323", "teen_club"],
  violence: ["hotline_1300", "hotline_1323", "teen_club"],
  other: ["teen_club", "hotline_1663", "hotline_1323"],
};

export interface Suggestion { service: Service; status: OpenStatus; reasonIntent: Intent }

/**
 * Pick 1–3 services for the ranked intents. Order: preference for the top intent, then
 * secondary intents; then open-now services move ahead of closed ones (stable), "unknown" in between.
 */
export function suggestServices(intents: Intent[], now: Date = new Date(), max = MAX_SUGGESTIONS): Suggestion[] {
  const byId = new Map(SERVICES.map((s) => [s.id, s]));
  const picked: Suggestion[] = [];
  const seen = new Set<string>();
  const list = intents.length ? intents : (["other"] as Intent[]);
  // Round-robin: top intent's first two picks, then one from each secondary intent.
  const queue: { id: string; intent: Intent }[] = [];
  list.forEach((intent, idx) => {
    const pref = PREFERENCE[intent] ?? PREFERENCE.other;
    pref.slice(0, idx === 0 ? 3 : 1).forEach((id) => queue.push({ id, intent }));
  });
  for (const intent of list) for (const id of PREFERENCE[intent] ?? []) queue.push({ id, intent });
  for (const q of queue) {
    if (picked.length >= max + 2) break;
    if (seen.has(q.id)) continue;
    const s = byId.get(q.id);
    if (!s) continue;
    seen.add(q.id);
    picked.push({ service: s, status: openStatus(s.hours, now), reasonIntent: q.intent });
  }
  const rank = { open: 0, unknown: 1, closed: 2 } as const;
  return picked
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank[a.p.status.state] - rank[b.p.status.state] || a.i - b.i)
    .slice(0, max)
    .map((x) => x.p);
}

export const INTENT_LABEL_TH: Record<Intent, string> = {
  pregnancy: "กังวลเรื่องท้อง / ท้องไม่พร้อม",
  emergency_contraception: "ยาคุมฉุกเฉิน / ไม่ได้ป้องกัน",
  contraception: "การคุมกำเนิด",
  sti_hiv: "เอชไอวี / โรคติดต่อทางเพศสัมพันธ์",
  relationship_consent: "ความสัมพันธ์และการยินยอม",
  mental_health: "ความเครียด / สุขภาพใจ",
  violence: "ความรุนแรง / ถูกขู่",
  other: "เรื่องอื่น ๆ",
};

/** Short supportive line per need (general info only, not medical advice). DRAFT copy. */
export const SUPPORT_LINE_TH: Record<Intent, string> = {
  pregnancy: "ความกังวลแบบนี้เกิดขึ้นได้ คุณไม่ได้อยู่คนเดียว มีเจ้าหน้าที่ที่คุยเรื่องนี้ได้โดยไม่ตัดสิน",
  emergency_contraception: "ยาคุมฉุกเฉินได้ผลดีที่สุดเมื่อใช้เร็วที่สุดหลังมีเพศสัมพันธ์ ลองคุยกับเจ้าหน้าที่หรือเภสัชกรเพื่อขอคำแนะนำ",
  contraception: "การคุมกำเนิดมีหลายวิธี เจ้าหน้าที่ช่วยคุณเลือกวิธีที่เหมาะกับตัวเองได้",
  sti_hiv: "การตรวจเป็นเรื่องปกติและเป็นความลับ เจ้าหน้าที่ช่วยบอกได้ว่าควรตรวจอะไรและที่ไหน",
  relationship_consent: "คุณมีสิทธิ์ปฏิเสธเสมอ ไม่ว่าจะเป็นใคร การคุยกับคนที่เข้าใจอาจช่วยได้",
  mental_health: "ขอบคุณที่เล่าให้ฟัง ความรู้สึกของคุณสำคัญ การได้คุยกับคนที่รับฟังอาจช่วยได้",
  violence: "สิ่งที่เกิดขึ้นไม่ใช่ความผิดของคุณ มีหน่วยงานที่ช่วยได้และเก็บเป็นความลับ",
  other: "ขอบคุณที่เล่าให้ฟัง นี่คือที่ที่คุยต่อได้กับเจ้าหน้าที่ตัวจริง",
};
