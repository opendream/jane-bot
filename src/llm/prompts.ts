import type { Intent } from "../core/types";
import { VALID_INTENTS } from "./adapter";

/** DRAFT prompts (Thai review pending). Short on purpose: prefill cost dominates on CPU. */
export const CLASSIFY_SYSTEM =
  "คุณจัดหมวดเรื่องที่วัยรุ่นอยากปรึกษา ตอบเป็น JSON เท่านั้น รูปแบบ {\"intent\":\"...\"} เลือกหนึ่งค่า:\n" +
  "pregnancy=กลัวท้อง ประจำเดือนไม่มา ท้องไม่พร้อม\n" +
  "emergency_contraception=เพิ่งมีเพศสัมพันธ์โดยไม่ป้องกัน ถุงยางแตก ยาคุมฉุกเฉิน\n" +
  "contraception=อยากคุมกำเนิด เลือกวิธีคุม\n" +
  "sti_hiv=เอชไอวี โรคติดต่อทางเพศ อยากตรวจ\n" +
  "relationship_consent=แฟน ความสัมพันธ์ การยินยอม การปฏิเสธ\n" +
  "mental_health=เครียด เศร้า กังวล นอนไม่หลับ\n" +
  "violence=ถูกขู่ แบล็กเมล์ ความรุนแรง\n" +
  "other=เรื่องอื่น";

export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: { intent: { type: "string", enum: [...VALID_INTENTS] } },
  required: ["intent"],
};

export function parseIntent(raw: string): Intent[] | null {
  const s = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const m = s.match(/"intent"\s*:\s*"([a-z_]+)"/);
  const i = m?.[1] as Intent | undefined;
  return i && VALID_INTENTS.includes(i) ? [i] : null;
}

export const POLISH_SYSTEM =
  "เรียบเรียงข้อความของผู้ใช้ให้เป็นประโยคเดียว สั้น สุภาพ บุรุษที่หนึ่ง ห้ามเพิ่มข้อมูลใหม่ ห้ามใส่ชื่อ เบอร์โทร หรือสถานที่ ตอบเฉพาะประโยคที่เรียบเรียงแล้ว";

export function cleanPolished(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^["'“”\s]+|["'“”\s]+$/g, "").split("\n")[0].trim();
}

/* ---- chat (plan v2 §4): pick a card from a shortlist; reword one card. DRAFT prompts. ---- */
export const NONE_ID = "none";
export const PICK_SYSTEM =
  "เลือกหัวข้อที่ตรงกับข้อความของผู้ใช้ที่สุดจากรายการ ตอบเป็น JSON เท่านั้น รูปแบบ {\"id\":\"...\"} ถ้าไม่มีข้อไหนตรง ตอบ {\"id\":\"none\"}";
export const PICK_MAX_TOKENS = 32;

export function pickSchema(ids: readonly string[]) {
  return { type: "object", properties: { id: { type: "string", enum: [...ids, NONE_ID] } }, required: ["id"] };
}
export function pickUser(text: string, shortlist: { id: string; title_th: string }[], previousTitle: string | null): string {
  const list = shortlist.map((s) => `${s.id} = ${s.title_th}`).join("\n");
  return `${previousTitle ? `หัวข้อก่อนหน้า: ${previousTitle}\n` : ""}รายการ:\n${list}\nข้อความ: ${text}`;
}
/** Only an id from the shortlist counts; "none", unknown ids and junk all mean "no pick". */
export function parsePick(raw: string, ids: readonly string[]): string | null {
  const s = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const m = s.match(/"id"\s*:\s*"([^"]+)"/);
  const id = m?.[1];
  return id && id !== NONE_ID && ids.includes(id) ? id : null;
}

export const REWORD_SYSTEM =
  "เรียบเรียงข้อความต่อไปนี้ใหม่ให้อ่านง่าย อบอุ่น เป็นภาษาไทย ย่อหน้าเดียว ความยาวใกล้เคียงเดิม " +
  "ห้ามเพิ่มหรือเปลี่ยนตัวเลข เบอร์โทร เวลา ลิงก์ ชื่อยา หรือข้อมูลทางการแพทย์ ห้ามตัดข้อมูลสำคัญ ตอบเฉพาะข้อความที่เรียบเรียงแล้ว";
export const REWORD_MAX_TOKENS = 160;
export function rewordUser(card: { answer_th: string; key_facts: string[] }): string {
  return `ข้อมูลที่ต้องคงไว้: ${card.key_facts.join(", ")}\nข้อความ: ${card.answer_th}`;
}
export function cleanReword(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*(ข้อความ\s*[:：])?\s*["'“”]?|["'“”]?\s*$/g, "").trim();
}
