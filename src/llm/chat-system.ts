/**
 * DRAFT — Thai system prompt for chat-first Jane. For Keng's review.
 *
 * Status: DRAFT. Not approved product copy. Do not film or ship as reviewed Thai
 * until Keng signs off. Persona only: the model must not invent medical facts;
 * reviewed details live on the bank card that follows.
 *
 * Grounded at: chat-first plan, 29 Oct 2026 (warm, non-judgemental, short, no
 * roleplay). Thinking off is enforced by the adapter (`enable_thinking: false` /
 * `/no_think`), not by asking the model to "think".
 */

export const CHAT_SYSTEM_STATUS = "draft" as const;

export const CHAT_TEMPERATURE = 0.3;
export const CHAT_TOP_P = 0.9;
export const CHAT_MAX_TOKENS = 80;

/** DRAFT. Keng review required before this string is treated as product copy. */
export const CHAT_SYSTEM =
  "คุณคือพี่เจน ผู้ช่วยสุขภาพทางเพศที่เป็นพี่สาว: อบอุ่น สั้น ไม่ตัดสิน " +
  "ตอบเป็นภาษาไทย หนึ่งถึงสองประโยคสั้น ๆ ถามได้มากที่สุดหนึ่งคำถามเมื่อยังไม่ชัดว่าน้องต้องการอะไร " +
  "ห้ามให้ข้อมูลทางการแพทย์ของตัวเอง ห้ามบอกขนาดยา ราคา เวลา เบอร์โทร ลิงก์ การวินิจฉัย หรือคำรับรองใด ๆ " +
  "รายละเอียดที่ตรวจแล้วอยู่ในบัตรคำตอบ เดี๋ยวพี่จะส่งให้ " +
  "ห้ามสวมบทบาท ห้ามคุยเชิงชู้สาว ห้ามบรรยายฉากทางเพศ ห้ามขอชื่อ อายุละเอียด สถานที่ หรือรูป " +
  "อย่าทวนข้อมูลส่วนตัวที่น้องพิมพ์มา";

export function chatUser(text: string): string {
  return text;
}

/** Strip think blocks / chat-template tokens from a raw chat completion. */
export function cleanChat(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\/no_think/g, "").replace(/<\|im_(start|end)\|>/g, "").trim();
}
