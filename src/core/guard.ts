import type { Intent } from "./types";
import type { BankCard } from "./bank";
import { findPhrases } from "./text";

/**
 * Input guard (plan §3 step 2), rules only, runs right after the crisis check.
 * DRAFT lists: Thai review pending. A hit returns a fixed refusal card (verbatim) plus a referral offer.
 */
export type GuardReason = "roleplay" | "explicit" | "image" | "dosing" | "abortion_method";

export const GUARD_RULES: Record<GuardReason, readonly string[]> = {
  roleplay: ["สวมบทบาท", "เล่นบทบาท", "แกล้งทำเป็นแฟน", "สมมติว่าเป็นแฟน", "เป็นแฟนกันไหม", "คุยแบบแฟน", "roleplay", "role play", "pretend to be my"],
  explicit: ["เรื่องเสียว", "คุยเสียว", "แชทเสียว", "บรรยายฉากเซ็กส์", "เล่าฉากเซ็กส์", "sexting", "dirty talk"],
  image: ["ส่งรูป", "ขอรูป", "ส่งภาพ", "ขอภาพ", "ส่งคลิป", "ขอคลิป", "ดูรูปโป๊", "รูปโป๊", "ภาพโป๊", "send a photo", "send pic", "nudes"],
  dosing: ["กินกี่เม็ด", "ต้องกินกี่เม็ด", "ขนาดยา", "กี่มิลลิกรัม", "กี่มก", "how many pills", "dosage"],
  abortion_method: ["วิธีทำแท้ง", "ทำแท้งเอง", "ยาทำแท้ง", "ยาขับเลือด", "ยาขับประจำเดือน", "how to abort"],
};

/** Order matters: the first matching reason wins. */
const ORDER: GuardReason[] = ["image", "explicit", "roleplay", "abortion_method", "dosing"];

export function checkInput(text: string): GuardReason | null {
  for (const r of ORDER) if (findPhrases(text, GUARD_RULES[r]).length) return r;
  return null;
}

const REFERRAL: Record<GuardReason, Intent[]> = {
  roleplay: ["other"], explicit: ["other"], image: ["other"],
  dosing: ["emergency_contraception", "contraception"], abortion_method: ["pregnancy"],
};

const TEXT: Record<GuardReason, string> = {
  roleplay: "เราคุยแบบสวมบทบาทไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามเราได้เลยค่ะ",
  explicit: "เราคุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามเราได้เลยค่ะ",
  image: "เรารับหรือส่งรูปไม่ได้นะคะ เล่าเป็นข้อความได้เลยค่ะ",
  dosing: "เราให้คำปรึกษาเรื่องขนาดยาหรือวิธีกินยาไม่ได้ค่ะ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรงค่ะ",
  abortion_method: "เราให้ข้อมูลวิธีทำแท้งไม่ได้ค่ะ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับนะคะ",
};

/** Fixed refusal cards (DRAFT copy, product text, not bank content). Always verbatim. */
export const REFUSAL_CARDS: Record<GuardReason, BankCard> = Object.fromEntries(ORDER.map((r) => [r, {
  id: `general.refusal_${r}.000`, topic: "general", title_th: "เรื่องนี้เราช่วยไม่ได้ค่ะ", answer_th: TEXT[r], key_facts: [], triggers: [],
  next: [], source_intents: [], source: [], review: { status: "draft", reviewer: null, reviewed_on: null, notes: "Fixed refusal copy, Thai review pending" },
  last_reviewed: null, flags: ["pii_checked"], referral: { offer: "soft", intents: REFERRAL[r] }, links: [], age_min: 15, reword: false,
  licence: "Apache-2.0 (product copy, OpenDream)",
} satisfies BankCard])) as unknown as Record<GuardReason, BankCard>;
