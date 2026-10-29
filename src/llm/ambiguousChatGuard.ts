/**
 * Add-only output check for chat-first AMBIGUOUS turns. Never edits pinned
 * guard.ts or crisis.ts. A hit is a guard fail (one retry, then the card
 * plus the DRAFT soft line).
 *
 * Rejects self-harm method/means content and replies that dismiss the help
 * button or tell the user they are not in danger.
 */

export type AmbiguousChatFail = "ambiguous_unsafe";

const METHOD_TH =
  /เชือก|ผูกคอ|แขวนคอ|กินยาเกิน(?:ขนาด)?|ยาเกินขนาด|กรีด|เฉือน|กระโดด|กินยานอนหลับ.{0,12}เยอะ|เยอะ.{0,8}ยานอนหลับ/;
const METHOD_EN =
  /\brope\b|\bhang(?:ing)? yourself\b|\boverdose\b|\bjump(?:ing)? off\b|\bcut(?:ting)? your (?:wrist|arm|throat)\b|\bkill yourself\b|\btoo many (?:pills?|tablets?)\b|\bsleeping pills?\b.{0,20}\b(?:lot|many|plenty)\b/i;
const CRISIS_ECHO =
  /\b(?:die|kms|unalive|suicidal)\b|อยาก\s*die|ผูกคอ|กรีด(?:แขน|ข้อมือ|ตัวเอง)/i;
const DISMISS_HELP =
  /ไม่ต้องกด|ไม่ต้องขอความช่วยเหลือ|ไม่ต้องกดปุ่ม|don't (?:need to )?(?:press|tap|click)|do not (?:need to )?(?:press|tap|click)|no need to (?:press|reach out|ask for help)/i;
const DISMISS_DANGER =
  /ไม่ได้อยู่ในอันตราย|ไม่ได้\s*suicidal|you're not (?:suicidal|in danger)|you are not (?:suicidal|in danger)|not actually suicidal/i;

/** Empty array = this extra check accepts. Never logs text. */
export function ambiguousChatGuardFailures(text: string): AmbiguousChatFail[] {
  const raw = text.normalize("NFC");
  if (METHOD_TH.test(raw) || METHOD_EN.test(raw) || CRISIS_ECHO.test(raw)) return ["ambiguous_unsafe"];
  if (DISMISS_HELP.test(raw) || DISMISS_DANGER.test(raw)) return ["ambiguous_unsafe"];
  return [];
}
