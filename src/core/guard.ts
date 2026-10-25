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
  // Coercion / threat words. Abuse fires when one of these and an image word appear in the same message.
  abuse: ["บังคับ", "ขู่", "แฉ", "แบล็กเมล", "แบล็กเมล์", "แบล็คเมล์", "threaten", "threatening", "threatened", "blackmail", "force", "forced", "leak", "leaking"],
  image: ["ส่งรูป", "ขอรูป", "ส่งภาพ", "ขอภาพ", "ส่งคลิป", "ขอคลิป", "ดูรูปโป๊", "รูปโป๊", "ภาพโป๊", "send a photo", "send pic", "nudes"],
  dosing: ["กินกี่เม็ด", "ต้องกินกี่เม็ด", "ขนาดยา", "กี่มิลลิกรัม", "กี่มก", "how many pills", "dosage"],
  complication: [
    "เลือดออกไม่หยุด", "เลือดไม่หยุด", "เลือดออกเยอะ", "ไข้สูง", "ตัวร้อนจัด",
    "เป็นลม", "หมดสติ", "หน้ามืด", "ชักเกร็ง", "ปวดมากจนทนไม่ไหว", "ปวดท้องรุนแรง",
    "high fever", "fainting", "severe pain", "bleeding won't stop", "bleeding will not stop",
  ],
  abortion_method: ["วิธีทำแท้ง", "ทำแท้งเอง", "ยาทำแท้ง", "ยาขับเลือด", "ยาขับประจำเดือน", "how to abort"],
};

/** Image / intimate-media tokens used with a coercion word (non-contiguous). */
const ABUSE_IMAGE = ["รูป", "ภาพ", "คลิป", "โป๊", "nude", "nudes", "photo", "pic", "pics", ...GUARD_RULES.image];

/** Past abortion / pill event (Thai and English). */
const PAST_ABORTION = [
  "ทำแท้งมาแล้ว", "ทำแท้งแล้ว", "เพิ่งทำแท้ง", "กินยาทำแท้ง", "ยาทำแท้ง",
  "had an abortion", "have an abortion", "after the abortion",
  "took abortion pills", "took the abortion pill", "abortion pills",
];

/** Severe bleeding that is itself an urgent-care present-state cue. */
const SEVERE_BLEEDING = [
  "เลือดออกไม่หยุด", "เลือดไม่หยุด", "bleeding won't stop", "bleeding will not stop", "bleeding wont stop",
];

const QUESTION = ["ไหม", "มั้ย", "หรือเปล่า", "is it normal", "does", "can", "?"];

/** Order for the remaining refusal reasons. Abuse / complication are decided first. */
const REFUSAL_ORDER: RefusalReason[] = ["image", "explicit", "roleplay", "abortion_method", "dosing"];

function isQuestion(text: string): boolean {
  return findPhrases(text, QUESTION).length > 0 || text.includes("?");
}

function isAbuse(text: string): boolean {
  return findPhrases(text, GUARD_RULES.abuse).length > 0 && findPhrases(text, ABUSE_IMAGE).length > 0;
}

function isComplication(text: string): boolean {
  if (isQuestion(text)) return false;
  const danger = findPhrases(text, GUARD_RULES.complication).length > 0;
  const bleeding = findPhrases(text, SEVERE_BLEEDING).length > 0;
  const past = findPhrases(text, PAST_ABORTION).length > 0;
  // Severe bleeding is a present-state cue on its own. Other danger signs need a past event.
  return bleeding || (past && danger);
}

export function checkInput(text: string): GuardReason | null {
  if (isAbuse(text)) return "abuse";
  if (isComplication(text)) return "complication";
  for (const r of REFUSAL_ORDER) if (findPhrases(text, GUARD_RULES[r]).length) return r;
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
