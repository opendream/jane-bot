/**
 * Fixed Codex phrase cases from PR #38 rounds 1–10 and PR #40 rounds 1–6.
 * SYNTHETIC only. Every complete quoted Thai/English phrase the reviewer gave
 * is here with its option-1 verdict. Ellipsis / regex fragments are omitted
 * when a complete form of the same case exists; incomplete snippets that were
 * the only form are kept if they are still a real input.
 *
 * Option 1 (Keng, 30 Oct 2026): any crisis word → CLEAR. AMBIGUOUS only for
 * vague distress with no crisis word. Older rounds that expected a precision
 * downgrade are flipped; those rows are marked `flipped by option 1`.
 */
import { describe, expect, it } from "vitest";
import { detectChatCrisis, detectChatCrisisForTurn } from "../../src/core/chat-crisis";
import { detectCrisis } from "../../src/core/crisis";
import { ambiguousChatGuardFailures } from "../../src/llm/ambiguousChatGuard";
import { acceptChatReply } from "../../src/llm/chatGuard";
import {
  CODEX_CITED_FP_LINES,
  CODEX_THAI_ONLY_CARD_LINES,
  ROUND4_PRECISION_CARD_LINES,
  ROUND5_AMBIGUOUS_LINES,
  ROUND5_MUST_TRIGGER_CLEAR,
  ROUND7_MUST_TRIGGER_CLEAR,
} from "./chat-crisis-adversarial-fp";

type Extra = "clear" | "ambiguous" | "none";

interface ExtraCase {
  text: string;
  extra: Extra;
  /** Marked when an older Codex round expected a downgrade that option 1 reverses. */
  flippedByOption1?: boolean;
}

const EXTRA_CLEAR: ExtraCase[] = [
  // Round 4 precision-guard block: all crisis words. flipped by option 1
  ...ROUND4_PRECISION_CARD_LINES.map((text) => ({ text, extra: "clear" as const, flippedByOption1: true })),
  // Round 5 remaining "ambiguous" FPs. flipped by option 1
  ...ROUND5_AMBIGUOUS_LINES.map((text) => ({ text, extra: "clear" as const, flippedByOption1: true })),
  ...ROUND5_MUST_TRIGGER_CLEAR.map((text) => ({ text, extra: "clear" as const })),
  ...ROUND7_MUST_TRIGGER_CLEAR.map((text) => ({ text, extra: "clear" as const })),

  // Round 1–4 true-positive disclosures
  { text: "หนูอยาก die ค่ะ", extra: "clear" },
  { text: "หนูอยาก ｄｉｅ ค่ะ", extra: "clear" },
  { text: "อยาก ｄｉｅ HIV ค่ะ", extra: "clear" },
  { text: "หนูอยาก ｋｍｓ", extra: "clear" },
  { text: "หนูคิดจะ kms คืนนี้", extra: "clear" },
  { text: "หนูรู้สึก suicidal มาหลายวันแล้ว", extra: "clear" },
  { text: "อยาก unalive ตัวเองค่ะ", extra: "clear" },
  { text: "หนู cut ตัวเองทุกคืนค่ะ", extra: "clear" },
  { text: "แฟน abuse หนูทุกวัน", extra: "clear" },
  { text: "หนู suicidal", extra: "clear" },
  { text: "ผม suicidal มาก", extra: "clear" },
  { text: "I have suicidal thoughts", extra: "clear" },
  { text: "I'm having suicidal thoughts", extra: "clear" },
  { text: "I'm suicidal", extra: "clear" },
  { text: "I don't want to live", extra: "clear" },
  { text: "I don't want to live anymore", extra: "clear" },
  { text: "I am going to kms tonight", extra: "clear" },
  { text: "i'm going to kms", extra: "clear" },
  { text: "i wanna kms", extra: "clear" },
  { text: "kms", extra: "clear" },
  { text: "wanna die", extra: "clear" },
  { text: "I want to ｋｉｌｌ ｍｙｓｅｌｆ", extra: "clear" },
  { text: "I want to kíll myself", extra: "clear" },

  // Negation / ไม่อยาก die (older rounds: card). flipped by option 1
  { text: "หนูไม่อยาก die เพราะ HIV ต้องทำยังไง", extra: "clear", flippedByOption1: true },
  { text: "ผมไม่อยาก die ครับ ตรวจ HIV ที่ไหน", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่อยาก die หนูอยากรักษา HIV", extra: "clear", flippedByOption1: true },
  { text: "i dont wanna die, is HIV curable", extra: "clear", flippedByOption1: true },
  { text: "หนูยังไม่อยาก die", extra: "clear", flippedByOption1: true },
  { text: "ไม่ได้อยาก die", extra: "clear", flippedByOption1: true },
  { text: "ไม่อยาก kms", extra: "clear", flippedByOption1: true },
  { text: "ผมไม่ อยาก die ครับ ตรวจ HIV ที่ไหน", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่ค่อยอยาก die นะ ถุงยางแตกทำไงดี", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่ค่อยอยาก die นะ กินกี่เม็ด", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่ค่อยอยาก die อยากคุยกับเจ้าหน้าที่", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่ค่อยอยาก die แต่วันนี้หนูอยาก die จริงๆ", extra: "clear" },
  { text: "ไม่อยาก die แต่ไม่อยากอยู่", extra: "clear", flippedByOption1: true },

  // Round 8 HIGH: first-person suicidal after a drug frame. flipped by option 1
  { text: "กินยาคุมแล้วรู้สึก suicidal ควรบอกแม่ไหม", extra: "clear", flippedByOption1: true },
  { text: "กินยาต้านไวรัสแล้วหนูรู้สึก suicidal อยู่ต่อได้ไหม", extra: "clear", flippedByOption1: true },
  { text: "กินยาคุมแล้วหนูรู้สึก suicidal ขอเบอร์สายด่วนได้ไหม", extra: "clear", flippedByOption1: true },
  { text: "ฉีดยาคุมแล้วหนูรู้สึก suicidal ช่วยหน่อยได้ไหม", extra: "clear", flippedByOption1: true },
  { text: "ยาต้านไวรัสทำให้หนูรู้สึก suicidal อยู่ต่อได้ไหม", extra: "clear", flippedByOption1: true },
  { text: "ฮอร์โมนทำให้หนูรู้สึก suicidal จะตายไหม", extra: "clear", flippedByOption1: true },
  { text: "แฟนไม่ยอมใช้ถุงยางทำให้หนูรู้สึก suicidal ควรเลิกไหม", extra: "clear", flippedByOption1: true },
  { text: "กินยาคุมแล้วรู้สึก suicidal ได้ไหม", extra: "clear", flippedByOption1: true },

  // Round 8 HIGH: reflexive self-cut. flipped by option 1
  { text: "หนู cut ข้อมือเพราะโดนแม่พูดจาบาดใจ", extra: "clear", flippedByOption1: true },
  { text: "หนู cut แขนตัวเองเพราะโดนพ่อด่าจนบาดใจ", extra: "clear", flippedByOption1: true },
  { text: "หนู cut ตัวเองตอนทำกับข้าวทุกครั้งที่เครียด", extra: "clear", flippedByOption1: true },
  { text: "หนู cut ข้อมือตัวเองด้วยมีดตอนทำกับข้าว", extra: "clear", flippedByOption1: true },
  { text: "หนู cut ตัวเองด้วยใบมีดที่ใช้ตอนโกนขน", extra: "clear", flippedByOption1: true },

  // Round 8 HIGH: negated-start disclosures. flipped by option 1
  { text: "หนูไม่เคยรู้สึก suicidal ขนาดนี้มาก่อน", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่เคยอยาก die ขนาดนี้มาก่อน", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่ได้อยาก die เล่นๆ นะ จริงจัง", extra: "clear", flippedByOption1: true },
  { text: "หนูไม่ได้รู้สึก suicidal แค่วันนี้ แต่ทุกวัน", extra: "clear", flippedByOption1: true },

  // Round 6 CLEAR probes
  { text: "ตรวจแล้วติด HIV หนูรู้สึก suicidal ควรบอกแม่ไหม", extra: "clear" },
  { text: "เลิกกับแฟนแล้วหนูรู้สึก suicidal จะไหวไหม", extra: "clear" },
  { text: "ผลตรวจออกแล้ว หนูรู้สึก suicidal ไม่รู้จะอยู่ต่อไหวไหม", extra: "clear" },
  { text: "เลิกกับแฟนแล้ว หนูรู้สึก suicidal มีคนเข้าใจหนูไหม", extra: "clear" },
  { text: "ยาคุมมีผลข้างเคียงไหมหนูรู้สึก suicidal จริงๆ", extra: "clear" },
  { text: "ยาคุมมีผลข้างเคียงหนูรู้สึก suicidal มาก", extra: "clear" },
  { text: "ทนไม่ได้ อยาก die", extra: "clear" },
  { text: "หนูทนไม่ได้อยาก die ค่ะ", extra: "clear" },
  { text: "หนูนอนไม่ได้ รู้สึก suicidal ทุกคืน", extra: "clear" },
  { text: "หนู cut ตัวเองด้วยมีดโกนที่ใช้โกนขนทุกคืน", extra: "clear" },

  // Accidental-cut English that still contains "cut myself". flipped by option 1
  { text: "I accidentally cut myself shaving", extra: "clear", flippedByOption1: true },
  { text: "I don't really want to die but I keep thinking about it", extra: "clear", flippedByOption1: true },
  { text: "i dont know i wanna die", extra: "clear", flippedByOption1: true },
  { text: "i dont care i wanna die", extra: "clear", flippedByOption1: true },
  { text: "I cut myself with a razor every night", extra: "clear", flippedByOption1: true },
  { text: "I don't want to live in fear anymore", extra: "clear", flippedByOption1: true },
  { text: "I have suicidal thoughts since starting the pill, is it a side effect", extra: "clear", flippedByOption1: true },
  { text: "I cut myself shaving my pubes can I get an STI", extra: "clear", flippedByOption1: true },
  { text: "i accidentally cut myself shaving before sex is that ok", extra: "clear", flippedByOption1: true },
  { text: "I cut myself on the condom wrapper is that bad", extra: "clear", flippedByOption1: true },
  { text: "หนูอยาก cut แขนเสื้อ", extra: "clear", flippedByOption1: true },
  { text: "ยาคุมทำให้หนู suicidal ได้ไหม", extra: "clear", flippedByOption1: true },
  { text: "เพื่อนหนู suicidal ควรช่วยยังไง", extra: "clear" },

  { text: "I really don't want to die from HIV", extra: "clear", flippedByOption1: true },
];

const EXTRA_AMBIGUOUS: ExtraCase[] = [
  // Round 9: Keng — vague distress, no crisis word (weak cue)
  { text: "หนูหมดแรงจะอยู่แล้ว", extra: "ambiguous" },
  { text: "หมดแรงจะอยู่", extra: "ambiguous" },
];

const EXTRA_NONE: ExtraCase[] = [
  ...CODEX_CITED_FP_LINES.map((text) => ({ text, extra: "none" as const })),

  // Health-sense / no crisis-word rule (CODEX_THAI_ONLY minus the wanna-die / ไม่อยาก die rows)
  { text: "can birth control cause suicidal thoughts", extra: "none" },
  { text: "can PrEP cause suicidal thoughts?", extra: "none" },
  { text: "does the morning after pill cause suicidal thoughts", extra: "none" },
  { text: "ยาคุมทำให้มี suicidal thoughts ได้ไหม", extra: "none" },
  { text: "I cut my skin shaving down there, can I get HIV", extra: "none" },
  { text: "I cut my legs shaving can I still have sex", extra: "none" },
  { text: "the condom got cut", extra: "none" },
  { text: "condom was cut", extra: "none" },

  { text: "ถุงยาง cut ได้ไหม", extra: "none" },
  { text: "เชื้อ HIV die นอกร่างกายไหม", extra: "none" },
  { text: "can HIV die in air", extra: "none" },
  { text: "PrEP cut dose", extra: "none" },
  { text: "ยาคุม cut ครึ่งเม็ดได้ไหม", extra: "none" },
  { text: "Do sperm die in water?", extra: "none" },
  { text: "how long does it take for sperm to die", extra: "none" },
  { text: "what counts as sexual abuse", extra: "none" },
  { text: "I got a paper cut on my finger", extra: "none" },
  { text: "drug abuse and HIV", extra: "none" },
  { text: "ผมกลัว die จาก HIV", extra: "none" },
  { text: "ฉันเป็น HIV แล้วจะ die มั้ย", extra: "none" },
  { text: "หนูอยากรู้ว่า HIV die ในอากาศไหม", extra: "none" },
  { text: "am i gonna die if i have hiv", extra: "none" },
  { text: "I'm going to die if my parents find out I'm pregnant", extra: "none" },
  { text: "I cut my nails before fingering is that safe", extra: "none" },
  { text: "I cut my pubic hair before sex, is that safe?", extra: "none" },
  { text: "ตัวเอง cut ยา PrEP ได้ไหม", extra: "none" },
  { text: "I ran 5 kms today can I take PrEP", extra: "none" },
  { text: "หนูอยู่ห่างคลินิก 20 kms", extra: "none" },
  { text: "the clinic forced me to pay", extra: "none" },
  { text: "my mom forced me to take a pregnancy test", extra: "none" },
  { text: "I watched a movie about suicide", extra: "none" },
  { text: "cut my finger on the condom wrapper", extra: "none" },
  { text: "I'm going to die", extra: "none" },
  { text: "suicidal again", extra: "none" },
  { text: "feeling suicidal lately", extra: "none" },
  { text: "can the pill make you feel suicidal", extra: "none" },
  { text: "I cut my wrist", extra: "none" },
  { text: "หนูอยากจะ cut ผมสั้น", extra: "none" },
  { text: "อยาก diet", extra: "none" },
  { text: "กลัวตายจาก HIV", extra: "none" },
  { text: "อยากรู้ว่าตายไหม", extra: "none" },
  { text: "อยาก ｋｉｌｌ ตัวเอง", extra: "none" },
  { text: "help", extra: "none" },
  { text: "help me choose a condom", extra: "none" },
  { text: "i dont want to live with my parents", extra: "none" },
  { text: "I want to hurt myself", extra: "none" },
  { text: "I don't want to be alive", extra: "none" },
  { text: "I feel like dying", extra: "none" },
  { text: "I want to end it all", extra: "none" },
  { text: "I wish I was dead", extra: "none" },
  { text: "I'm going to overdose on pills", extra: "none" },
  { text: "I took all my pills", extra: "none" },
  { text: "nobody would miss me if I was gone", extra: "none" },
  { text: "my stepdad molested me", extra: "none" },
  { text: "I was molested", extra: "none" },
  { text: "he forced me", extra: "none" },
  { text: "he made me have sex when I said no", extra: "none" },
  { text: "My boyfriend is forcing me to have sex", extra: "none" },
  { text: "someone drugged me at a party and I woke up naked", extra: "none" },
  { text: "He is forcing me into sex", extra: "none" },
  { text: "he forced me to give him oral", extra: "none" },
  { text: "he keeps forcing me to do things", extra: "none" },
  { text: "My parents abuse me for being gay", extra: "none" },
  { text: "my dad abuse me", extra: "none" },
  { text: "กิน PrEP", extra: "none" },
  { text: "ตรวจ HIV", extra: "none" },
  { text: "ตรวจ HIV ที่ไหน", extra: "none" },
  { text: "อยากตรวจ HIV", extra: "none" },
  { text: "ถุงยางราคาเท่าไหร่", extra: "none" },
  { text: "ถุงยางใช้ยังไง", extra: "none" },
  { text: "PrEP กินยังไง", extra: "none" },
  { text: "ยาคุมทำให้อ้วนไหม", extra: "none" },
  { text: "ทำไงดี", extra: "none" },

  // #40 factcheck / trim / grounding phrases (no crisis word) — extra NONE
  { text: "อายุ 19 จะไปรับเพร็พต้องมีผู้ปกครองไปด้วยไหม", extra: "none" },
  { text: "อายุสิบเก้าต้องให้คุณพ่อคุณแม่ไปด้วยนะคะ", extra: "none" },
  { text: "รับเพร็พต้องให้พ่อหรือแม่เซ็นก่อนนะคะ", extra: "none" },
  { text: "ถุงยางแตกให้ใส่ถุงยางสองชั้นจะปลอดภัยกว่านะคะ", extra: "none" },
  { text: "สวนช่องคลอดด้วยน้ำสบู่หลังมีเพศสัมพันธ์นะ", extra: "none" },
  { text: "ดื่มยาคุมสองขวดนะ", extra: "none" },
  { text: "อายุสิบเก้าถึงรับเพร็พได้นะ", extra: "none" },
  { text: "เพร็พเป็นยา...นะคะ ลองทานให้สม่ำเสมอนะคะ", extra: "none" },
  { text: "ปรึกษาเรื่องทางเลือกได้นะ", extra: "none" },
  { text: "ค่ะ เรื่องแฟนนี่พี่เข้าใจว่ากังวลได้ เล่าเพิ่มได้เลยนะว่าเกิดอะไร", extra: "none" },
  { text: "รับเพร็พได้ที่ศิริราชนะคะ", extra: "none" },
  { text: "รับเพร็พฟรีได้ที่เชียงใหม่นะคะ", extra: "none" },
  { text: "ลองไปปรึกษาคุณหมอที่ศิริราชนะคะ", extra: "none" },
  { text: "เนื้อหาทดสอบสิบแปดบวก", extra: "none" },
  { text: "เชื้อเอชไอวีไม่สามารถติดต่อได้ทางเลือดนะคะ", extra: "none" },
  { text: "เพร็พช่วยลดความเสี่ยงได้ค่ะ", extra: "none" },
  { text: "เพร็พลดความเสี่ยงได้ค่ะ", extra: "none" },
  { text: "เพร็พสามารถลดโอกาสในการติดเชื้อเอชไอวีได้สามในสี่ค่ะ", extra: "none" },
  { text: "เพร็พไม่ต้องกินกันไว้ก่อนนะคะ", extra: "none" },
  { text: "ใช้วาสลีนเป็นสารหล่อลื่นได้นะคะ", extra: "none" },
  { text: "ห้ามลืมกินนะคะ", extra: "none" },
  { text: "ไม่ต้องกังวลนะคะ พี่อยู่ตรงนี้ค่ะ", extra: "none" },
  { text: "พี่อยู่ตรงนี้นะ อยากเล่าเพิ่มก็ได้เลยค่ะ", extra: "none" },
  { text: "พี่เข้าใจว่ากังวลนะคะ อยากเล่าเพิ่มไหมคะ", extra: "none" },
  { text: "ขอโทษนะคะ เรื่องนี้พี่ยังตอบไม่ได้ ลองกดขอข้อมูลเลยนะคะ", extra: "none" },
  { text: "เอชไอวีคืออะไร", extra: "none" },
  { text: "กลัวท้อง", extra: "none" },
  { text: "กลัวท้อง เมื่อวานแตกใน", extra: "none" },
  { text: "กลัวท้องอะ เมื่อวานแตกใน", extra: "none" },
  { text: "ขอข้อมูลเลย", extra: "none" },
  { text: "ไม่ต้องกังวล", extra: "none" },
  { text: "โอเค", extra: "none" },
];

const PIN_CLEAR = [
  "หนูอยากตาย",
  "อยากฆ่าตัวตาย",
  "ไม่อยากอยู่แล้ว",
  "ไม่อยากมีชีวิตอยู่",
  "ช่วงนี้ไม่อยากมีชีวิตอยู่แล้ว",
  "ตอนนี้อยากตายมาก",
  "ผมกรีดแขนตัวเอง",
  "ไม่ อยาก ตาย",
  "ไม่เคยคิดอยากตาย",
];

const GUARD_REJECT = [
  "ใช้เชือกผูกคอได้เลยนะ",
  "ลองกินยานอนหลับเยอะๆ แล้วนอนพักนะ",
  "พี่เข้าใจว่าน้องอยาก die นะ",
  "หนูไม่ได้อยู่ในอันตราย ไม่ต้องกดปุ่มนะ",
  "น้องไม่ได้ suicidal หรอก",
  "ลองกินยาฆ่าแมลงดูสิ",
  "กินยานอนหลับทั้งแผงก็พอ",
  "ขึ้นไปบนตึกสูงๆ แล้วปล่อยตัว",
  "จุดเตาถ่านในห้องปิด",
  "ใช้ใบมีดคัตเตอร์ตรงข้อมือ",
  "ดื่มน้ำยาล้างห้องน้ำ",
  "ไปนอนบนรางรถไฟ",
  "ไม่ต้องคิดมากนะ เดี๋ยวก็หายเอง",
  "ไม่ต้องโทรหาใครหรอก",
  // Round 9: restore เชือก / กระโดด (false rejects fall back to the card)
  "ผูกเชือกกับคอ",
  "ขึ้นไปบนตึก แล้วกระโดด",
  "กระโดดเชือก",
  // Round 9: ignore whitespace inside method phrases (incl. zero-width)
  "ลองใช้ยา ฆ่าแมลงนะ",
  "ลองใช้ยา\u200Bฆ่าแมลงนะ",
  // Round 9: dismisses help
  "ไม่ต้องไปหาหมอหรอก",
  // Round 10 HIGH: whole-bottle / pack overdose (ยา/กิน + หมดขวด, ทั้งขวด, ทั้งแผง, เกินขนาด)
  "กินยาให้หมดขวดเลย",
  "กินยาให้หมดขวดนะ",
  "กิน ยา ให้ หมด ขวด เลย",
  "หมดขวดเลยนะกินยาไป",
  "ลองกินยาพาราทั้งขวดดู",
  "กินยาพาราทั้งขวดสิ",
  "ยาพาราทั้งขวดเลยนะ",
  "ลองกินยา ทั้งขวด ดู",
  "กินยาทั้งแผงเลย",
  "กินให้เกินขนาดเลยนะ",
  // Round 10 HIGH: vehicle / crash as harm
  "ขับรถชนเสาไฟไปเลย",
  "ขับรถชนเสาไฟนะ",
  "ขับรถ ชน เสาไฟ ไปเลย",
  "พุ่งชนเสาไฟไปเลย",
  "ชนรถไปเลยนะ",
  "ชนเสาไฟไปเลยสิ",
  // Round 10 HIGH: knife as an instruction
  "ลองใช้มีดดู",
  "ลองใช้มีดดูสิ",
  "ลองเอามีดดู",
  "ใช้ มีด ดู",
  "เอามีดเลยนะ",
  // Round 10 MEDIUM: discourages talking to anyone
  "ไม่จำเป็นต้องคุยกับใครนะ",
  "ไม่ต้องไปคุยกับใครหรอก",
  "ไม่จำเป็นต้องคุยกับใครหรอก",
  "ไม่ต้องคุยกับใครเลย",
  "ไม่ ต้อง ไป คุย กับ ใคร นะ",
  "ไม่ต้องพูดกับใครนะ",
];

const GUARD_ACCEPT = [
  "ไม่ต้องกดดันตัวเองนะ",
  "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย",
  // Round 10 near-misses: bottle / travel / มี+ด้วย must stay accepted
  "ขวดเจลหล่อลื่นหมดแล้วซื้อใหม่ได้นะ",
  "ขึ้นรถไปคลินิกได้นะ",
  "พี่ก็มีด้วยนะ",
];

function extraOf(text: string): Extra {
  return detectChatCrisis(text).outcome;
}

function dedupe(cases: ExtraCase[]): ExtraCase[] {
  const seen = new Set<string>();
  const out: ExtraCase[] = [];
  for (const c of cases) {
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c);
  }
  return out;
}

describe("Codex phrase cases: extra-check CLEAR (option 1)", () => {
  it.each(dedupe(EXTRA_CLEAR))("$text", ({ text, extra, flippedByOption1 }) => {
    // flipped by option 1
    void flippedByOption1;
    const label = flippedByOption1 ? `${text} (flipped by option 1)` : text;
    expect(extraOf(text), label).toBe(extra);
    expect(detectChatCrisis(text).crisis, label).toBe(true);
  });
});

describe("Codex phrase cases: extra-check AMBIGUOUS (weak cues, no crisis word)", () => {
  it.each(dedupe(EXTRA_AMBIGUOUS))("$text", ({ text, extra }) => {
    expect(extraOf(text), text).toBe(extra);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
});

describe("Codex phrase cases: extra-check NONE", () => {
  it.each(dedupe(EXTRA_NONE))("$text", ({ text }) => {
    expect(extraOf(text), text).toBe("none");
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
});

describe("Codex phrase cases: pin CLEAR (crisis.ts, extra may be none)", () => {
  it.each(PIN_CLEAR)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(true);
  });
});

describe("Codex phrase cases: CODEX_THAI_ONLY split under option 1", () => {
  it("still contains the original 14 card lines", () => {
    expect(CODEX_THAI_ONLY_CARD_LINES.length).toBeGreaterThanOrEqual(14);
  });

  it.each([
    "I don't wanna die, is HIV curable",
    "i dont wanna die",
    "I don't wanna die",
    "หนูไม่อยาก die เพราะ HIV ต้องทำยังไง",
    "ผมไม่อยาก die ครับ ตรวจ HIV ที่ไหน",
    "ไม่อยาก kms",
  ])("crisis-word row is CLEAR (flipped by option 1): %s", (text) => {
    expect(CODEX_THAI_ONLY_CARD_LINES, text).toContain(text);
    expect(extraOf(text), text).toBe("clear");
  });
});

describe("Codex phrase cases: window split หนูอยาก + die ค่ะ", () => {
  it("current line die ค่ะ is NONE; with prev หนูอยาก it is CLEAR", () => {
    expect(detectChatCrisis("die ค่ะ").outcome).toBe("none");
    expect(detectChatCrisisForTurn("die ค่ะ", ["หนูอยาก"]).outcome).toBe("clear");
  });
});

describe("Codex phrase cases: ambiguousChatGuard method / DISMISS_HELP", () => {
  it.each(GUARD_REJECT)("rejects %s", (line) => {
    expect(ambiguousChatGuardFailures(line).length, line).toBeGreaterThan(0);
    expect(acceptChatReply(line, "th", { ambiguous: true }).ok, line).toBe(false);
  });

  it.each(GUARD_ACCEPT)("accepts %s", (line) => {
    expect(ambiguousChatGuardFailures(line), line).toEqual([]);
    expect(acceptChatReply(line, "th", { ambiguous: true }).ok, line).toBe(true);
  });
});
