/**
 * Add-only output check for chat-first AMBIGUOUS turns. Never edits pinned
 * guard.ts or crisis.ts. A hit is a guard fail (one retry, then the card
 * plus the DRAFT soft line).
 *
 * Rejects self-harm method/means content and replies that dismiss the help
 * button or tell the user they are not in danger.
 */

export type AmbiguousChatFail = "ambiguous_unsafe";

/** Method/means by category. Bare กระโดด / เชือก are not enough (กระโดดเชือก is jump-rope). */
const METHOD_TH =
  /ผูกคอ|แขวนคอ|ใช้เชือก|กินยาเกิน(?:ขนาด)?|ยาเกินขนาด|กรีด|เฉือน|กระโดด(?:จาก|ลง|ตึก|สะพาน|ที่สูง)|กินยานอนหลับ.{0,12}เยอะ|เยอะ.{0,8}ยานอนหลับ|ยานอนหลับทั้งแผง|ทั้งแผง.{0,8}ยา|ยาฆ่าแมลง|ยาเบื่อ|ยาพิษ|กินพิษ|ตึกสูง|ดาดฟ้า|ปล่อยตัว|ใบมีด|คัตเตอร์|เตาถ่าน|ไอเสีย|ก๊าซหุงต้ม|ถ่านในห้อง|รางรถไฟ|น้ำยาล้าง|สารเคมี|ดื่มกรด/;
const METHOD_EN =
  /\brope\b|\bhang(?:ing)? yourself\b|\boverdose\b|\bjump(?:ing)? off\b|\bcut(?:ting)? your (?:wrist|arm|throat)\b|\bkill yourself\b|\btoo many (?:pills?|tablets?)\b|\bsleeping pills?\b.{0,20}\b(?:lot|many|plenty)\b|\bpoison\b|\bpesticide\b|\bbleach\b|\brooftop\b|\btall building\b|\brazor\b|\bblade\b|\bcutter\b|\bcharcoal\b|\bexhaust\b|\btrain tracks?\b|\brailway\b|\bdrain cleaner\b|\bchemicals?\b/i;
const CRISIS_ECHO =
  /\b(?:die|kms|unalive|suicidal)\b|อยาก\s*die|ผูกคอ|กรีด(?:แขน|ข้อมือ|ตัวเอง)/i;
/** ไม่ต้องกด must not eat กดดัน. */
const DISMISS_HELP =
  /ไม่ต้องกด(?!ดัน)|ไม่ต้องคิดมาก|ไม่ต้องโทรหาใคร|ไม่ต้องขอความช่วยเหลือ|ไม่ต้องกดปุ่ม|don't (?:need to )?(?:press|tap|click)|do not (?:need to )?(?:press|tap|click)|no need to (?:press|reach out|ask for help)/i;
const DISMISS_DANGER =
  /ไม่ได้อยู่ในอันตราย|ไม่ได้\s*suicidal|you're not (?:suicidal|in danger)|you are not (?:suicidal|in danger)|not actually suicidal/i;

/** Empty array = this extra check accepts. Never logs text. */
export function ambiguousChatGuardFailures(text: string): AmbiguousChatFail[] {
  const raw = text.normalize("NFC");
  if (METHOD_TH.test(raw) || METHOD_EN.test(raw) || CRISIS_ECHO.test(raw)) return ["ambiguous_unsafe"];
  if (DISMISS_HELP.test(raw) || DISMISS_DANGER.test(raw)) return ["ambiguous_unsafe"];
  return [];
}
