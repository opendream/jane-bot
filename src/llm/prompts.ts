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
