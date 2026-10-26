import type { Intent, Service, CrisisLine } from "./types";
import { openStatus, narrowestHours, hoursLabel, type OpenStatus } from "./openNow";
import { MAX_SUGGESTIONS } from "../config";
import data from "../data/services.json";

/** Effective hours = narrowest window across the cited sources (see narrowestHours). */
export const SERVICES: Service[] = (data.services as unknown as Omit<Service, "hours">[]).map((s) => ({
  ...s, hours: narrowestHours(s.hours_sources.map((x) => x.hours)),
}));
export const CRISIS_LINES = data.crisis_lines as unknown as CrisisLine[];
export const DATA_VERSION = data.data_version;

export function serviceById(id: string): Service {
  const s = SERVICES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown service: ${id}`);
  return s;
}

/** Effective hours label from services.json (one source of truth for cards, open-now, under-15, crisis). */
export function serviceHoursLabel(id: string): string {
  return hoursLabel(serviceById(id).hours);
}

/** Preferred services per need, best first. */
export const PREFERENCE: Record<Intent, string[]> = {
  pregnancy: ["hotline_1663", "teen_club", "tamtang", "rsa_online"],
  emergency_contraception: ["hotline_1663", "teen_club", "yfhs"],
  contraception: ["teen_club", "hotline_1663", "yfhs"],
  sti_hiv: ["hotline_1663", "yfhs", "teen_club"],
  relationship_consent: ["teen_club", "hotline_1323", "hotline_1300"],
  mental_health: ["hotline_1323", "teen_club"],
  violence: ["hotline_1300", "hotline_1323", "oscc_hospital", "teen_club"],
  other: ["teen_club", "hotline_1663", "hotline_1323"],
};

export interface Suggestion { service: Service; status: OpenStatus; reasonIntent: Intent }

/** In-person-only cards stay informational — no handoff draft (pinned preferredChannel would say ออนไลน์). */
export function canPrepareMessage(service: Service): boolean {
  return service.channels.some((c) => c.type !== "in_person");
}

/**
 * Pick 1–3 services for the ranked intents.
 * Pool: every preferred service for the top intent, plus the first preferred service of each
 * secondary intent. Then open-now services move ahead (stable: preference order otherwise kept).
 * Only if the pool is smaller than `max` do we fill from the secondary intents' other services.
 */
export function suggestServices(intents: Intent[], now: Date = new Date(), max = MAX_SUGGESTIONS): Suggestion[] {
  const byId = new Map(SERVICES.map((s) => [s.id, s]));
  const list = intents.length ? intents : (["other"] as Intent[]);
  const seen = new Set<string>();
  const pool: Suggestion[] = [];
  const add = (id: string, intent: Intent) => {
    const s = byId.get(id);
    if (!s || seen.has(id)) return;
    seen.add(id);
    pool.push({ service: s, status: openStatus(s.hours, now), reasonIntent: intent });
  };
  list.forEach((intent, idx) => {
    const pref = PREFERENCE[intent] ?? PREFERENCE.other;
    (idx === 0 ? pref : pref.slice(0, 1)).forEach((id) => add(id, intent));
  });
  if (pool.length < max) for (const intent of list) for (const id of PREFERENCE[intent] ?? []) add(id, intent);
  return pool
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.status.state !== "open") - Number(b.p.status.state !== "open") || a.i - b.i)
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
