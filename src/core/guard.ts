import type { Intent } from "./types";
import type { BankCard } from "./bank";
import { findPhrases } from "./text";

/**
 * Input guard (plan §3 step 2), rules only, runs right after the crisis check.
 * DRAFT lists: Thai review pending. A hit returns a fixed refusal card (verbatim) plus a referral offer.
 */
export type RefusalReason = "roleplay" | "explicit" | "image" | "dosing" | "abortion_method";
export type GuardReason = RefusalReason | "abuse" | "complication";

export const GUARD_RULES: Record<GuardReason, readonly string[]> = {
  roleplay: ["สวมบทบาท", "เล่นบทบาท", "แกล้งทำเป็นแฟน", "สมมติว่าเป็นแฟน", "เป็นแฟนกันไหม", "คุยแบบแฟน", "roleplay", "role play", "pretend to be my"],
  explicit: ["เรื่องเสียว", "คุยเสียว", "แชทเสียว", "บรรยายฉากเซ็กส์", "เล่าฉากเซ็กส์", "sexting", "dirty talk"],
  // Threat / blackmail first so a disclosure is not treated as "please send a photo".
  abuse: [
    "ขู่ว่าจะส่งรูป", "ขู่จะส่งรูป", "ขู่ว่าจะส่งภาพ", "ขู่จะส่งภาพ", "ขู่ว่าจะส่งคลิป", "ขู่จะส่งคลิป",
    "ขู่ว่าจะปล่อยรูป", "ขู่จะปล่อยรูป", "ขู่ปล่อยรูป", "ขู่ว่าจะปล่อยคลิป", "ขู่จะปล่อยคลิป", "ขู่ปล่อยคลิป",
    "ขู่ว่าจะโพสต์รูป", "ขู่จะโพสต์รูป", "ขู่ว่าจะโพสต์คลิป", "ขู่จะโพสต์คลิป",
    "แบล็กเมล์", "แบล็คเมล์", "blackmail", "threatened to send nudes", "threaten to send nudes",
  ],
  image: ["ส่งรูป", "ขอรูป", "ส่งภาพ", "ขอภาพ", "ส่งคลิป", "ขอคลิป", "ดูรูปโป๊", "รูปโป๊", "ภาพโป๊", "send a photo", "send pic", "nudes"],
  dosing: ["กินกี่เม็ด", "ต้องกินกี่เม็ด", "ขนาดยา", "กี่มิลลิกรัม", "กี่มก", "how many pills", "dosage"],
  // Danger signs before a how-to / method refusal.
  complication: [
    "เลือดออกไม่หยุด", "เลือดไม่หยุด", "เลือดออกเยอะ", "ไข้สูง", "ตัวร้อนจัด",
    "เป็นลม", "หมดสติ", "หน้ามืด", "ชักเกร็ง", "ปวดมากจนทนไม่ไหว", "ปวดท้องรุนแรง",
    "high fever", "fainting", "severe pain", "bleeding won't stop", "bleeding will not stop",
  ],
  abortion_method: ["วิธีทำแท้ง", "ทำแท้งเอง", "ยาทำแท้ง", "ยาขับเลือด", "ยาขับประจำเดือน", "how to abort"],
};

/** Order matters: the first matching reason wins. Abuse / complication beat image and method refusals. */
const ORDER: GuardReason[] = ["abuse", "complication", "image", "explicit", "roleplay", "abortion_method", "dosing"];
const REFUSAL_ORDER: RefusalReason[] = ["image", "explicit", "roleplay", "abortion_method", "dosing"];

export function checkInput(text: string): GuardReason | null {
  for (const r of ORDER) {
    if (!findPhrases(text, GUARD_RULES[r]).length) continue;
    // Danger signs only override when a method/how-to phrase is also present, so
    // a period-pain or "almost fainted" line is not treated as urgent care.
    if (r === "complication" && !findPhrases(text, GUARD_RULES.abortion_method).length) continue;
    return r;
  }
  return null;
}

const REFERRAL: Record<RefusalReason, Intent[]> = {
  roleplay: ["other"], explicit: ["other"], image: ["other"],
  dosing: ["emergency_contraception", "contraception"], abortion_method: ["pregnancy"],
};

const TEXT: Record<RefusalReason, string> = {
  roleplay: "พี่คุยแบบสวมบทบาทไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามพี่ได้เลย",
  explicit: "พี่คุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามพี่ได้เลย",
  image: "พี่รับหรือส่งรูปไม่ได้ และไม่ต้องส่งรูปใด ๆ มานะ เล่าเป็นข้อความได้เลย",
  dosing: "เรื่องขนาดยาหรือวิธีกินยา พี่บอกไม่ได้ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรง",
  abortion_method: "พี่ให้ข้อมูลวิธีทำแท้งไม่ได้ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับ",
};

/** Fixed refusal cards (DRAFT copy, product text, not bank content). Always verbatim. */
export const REFUSAL_CARDS: Record<RefusalReason, BankCard> = Object.fromEntries(REFUSAL_ORDER.map((r) => [r, {
  id: `general.refusal_${r}.000`, topic: "general", title_th: "เรื่องนี้พี่ช่วยไม่ได้", answer_th: TEXT[r], key_facts: [], triggers: [],
  next: [], source_intents: [], source: [], review: { status: "draft", reviewer: null, reviewed_on: null, notes: "Fixed refusal copy, Thai review pending" },
  last_reviewed: null, flags: ["pii_checked"], referral: { offer: "soft", intents: REFERRAL[r] }, links: [], age_min: 15, reword: false,
  licence: "Apache-2.0 (product copy, OpenDream)",
} satisfies BankCard])) as unknown as Record<RefusalReason, BankCard>;
