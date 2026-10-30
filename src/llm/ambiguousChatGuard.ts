/**
 * Add-only output check for chat-first AMBIGUOUS turns. Never edits pinned
 * guard.ts or crisis.ts. A hit is a guard fail (one retry, then the card
 * plus the DRAFT soft line).
 *
 * Rejects self-harm method/means content and replies that dismiss the help
 * button or tell the user they are not in danger.
 */
import { compact, normalize } from "../core/text";

export type AmbiguousChatFail = "ambiguous_unsafe";

/**
 * Method/means by category. Bare กระโดด / เชือก are restored (option 1: a
 * rejected reply falls back to the card; กระโดดเชือก jump-rope is a false reject).
 *
 * Overdose / whole-bottle / whole-pack needs ยา or กิน next to หมดขวด /
 * ทั้งขวด / ทั้งแผง / เกินขนาด (bare ขวด is a lube/medicine bottle). Crash
 * cues are vehicle-as-harm compounds, not bare รถ. Knife-as-instruction is
 * ใช้มีด / เอามีด / มีด, but มีด must not eat มีด้วย (มี + ด้วย).
 */
const METHOD_TH =
  /เชือก|ผูกคอ|แขวนคอ|กินยาเกิน(?:ขนาด)?|ยาเกินขนาด|กรีด|เฉือน|กระโดด|กินยานอนหลับ.{0,12}เยอะ|เยอะ.{0,8}ยานอนหลับ|ยานอนหลับทั้งแผง|ทั้งแผง.{0,8}ยา|ยาฆ่าแมลง|ยาเบื่อ|ยาพิษ|กินพิษ|ตึกสูง|ดาดฟ้า|ปล่อยตัว|ใบมีด|คัตเตอร์|เตาถ่าน|ไอเสีย|ก๊าซหุงต้ม|ถ่านในห้อง|รางรถไฟ|น้ำยาล้าง|สารเคมี|ดื่มกรด|กิน.{0,16}(?:หมดขวด|ทั้งขวด|ทั้งแผง|เกินขนาด)|ยา.{0,12}(?:หมดขวด|ทั้งขวด)|(?:หมดขวด|ทั้งขวด).{0,8}(?:กิน|ยา)|ขับรถชน|พุ่งชน|ชนเสา|ชนรถ|ใช้มีด|เอามีด|มีด(?!้)/;
const METHOD_EN =
  /\brope\b|\bhang(?:ing)? yourself\b|\boverdose\b|\bjump(?:ing)? off\b|\bcut(?:ting)? your (?:wrist|arm|throat)\b|\bkill yourself\b|\btoo many (?:pills?|tablets?)\b|\bsleeping pills?\b.{0,20}\b(?:lot|many|plenty)\b|\bpoison\b|\bpesticide\b|\bbleach\b|\brooftop\b|\btall building\b|\brazor\b|\bblade\b|\bcutter\b|\bcharcoal\b|\bexhaust\b|\btrain tracks?\b|\brailway\b|\bdrain cleaner\b|\bchemicals?\b/i;
const CRISIS_ECHO =
  /\b(?:die|kms|unalive|suicidal)\b|อยาก\s*die|ผูกคอ|กรีด(?:แขน|ข้อมือ|ตัวเอง)/i;
/** ไม่ต้องกด must not eat กดดัน. Isolation: don't talk to / call anyone. */
const DISMISS_HELP =
  /ไม่ต้องกด(?!ดัน)|ไม่ต้องคิดมาก|ไม่ต้องโทรหาใคร|ไม่ต้องไปหาหมอ|ไม่ต้องขอความช่วยเหลือ|ไม่ต้องกดปุ่ม|ไม่(?:จำเป็น)?ต้อง(?:ไป)?(?:คุย|โทร|พูด)(?:กับ|หา)?ใคร|don't (?:need to )?(?:press|tap|click)|do not (?:need to )?(?:press|tap|click)|no need to (?:press|reach out|ask for help)/i;
const DISMISS_DANGER =
  /ไม่ได้อยู่ในอันตราย|ไม่ได้\s*suicidal|you're not (?:suicidal|in danger)|you are not (?:suicidal|in danger)|not actually suicidal/i;

function hit(re: RegExp, hay: string): boolean {
  re.lastIndex = 0;
  return re.test(hay);
}

/** Empty array = this extra check accepts. Never logs text. */
export function ambiguousChatGuardFailures(text: string): AmbiguousChatFail[] {
  // compact(): Thai (spaces/ZWSP stripped). normalize(): English \b / spaced phrases.
  const folded = compact(text);
  const norm = normalize(text);
  const unsafe = (re: RegExp) => hit(re, folded) || hit(re, norm);
  if (unsafe(METHOD_TH) || unsafe(METHOD_EN) || unsafe(CRISIS_ECHO)) return ["ambiguous_unsafe"];
  if (unsafe(DISMISS_HELP) || unsafe(DISMISS_DANGER)) return ["ambiguous_unsafe"];
  return [];
}
