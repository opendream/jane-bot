import { describe, expect, it } from "vitest";
import {
  CHAT_MAX_CHARS,
  CHAT_MAX_CHARS_EN,
  acceptChatReply,
  chatGuardFailures,
} from "../../src/llm/chatGuard";

// SYNTHETIC strings only — never real names, phones, or clinical claims.

const SAFE = "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";

describe("chatGuard (generated Jane replies)", () => {
  it("accepts a short warm Thai line with no numbers or claims", () => {
    expect(chatGuardFailures(SAFE)).toEqual([]);
    expect(acceptChatReply(SAFE)).toEqual({ ok: true, text: SAFE });
  });

  it("accepts Arabic digits in ordinary Thai chat", () => {
    expect(chatGuardFailures("กินภายใน 72 ชั่วโมงนะ")).toEqual([]);
    expect(acceptChatReply("รอ 1 นาที")).toEqual({ ok: true, text: "รอ 1 นาที" });
  });

  it("accepts Thai digits in ordinary Thai chat", () => {
    expect(chatGuardFailures("รอแป๊บ ๓ นาทีนะ")).toEqual([]);
    expect(acceptChatReply("รอแป๊บ ๓ นาทีนะ").ok).toBe(true);
  });

  it("rejects URLs", () => {
    expect(chatGuardFailures("ดูที่ www.example.com นะ")).toContain("url");
    expect(chatGuardFailures("เปิด https://example.org/help")).toContain("url");
  });

  it("rejects @handles and emails", () => {
    expect(chatGuardFailures("แอดมา @teen_helper ได้เลย")).toContain("handle");
    expect(chatGuardFailures("ส่งมาที่ name@example.com นะ")).toContain("email");
  });

  it("rejects a digit phone number as phone, not digits", () => {
    expect(chatGuardFailures("โทร 0812345678 ได้เลย")).toContain("phone");
    expect(chatGuardFailures("โทร 0812345678 ได้เลย")).not.toContain("digits");
    expect(acceptChatReply("โทร 0812345678 ได้เลย").ok).toBe(false);
  });

  it("accepts a warm line that only mentions a call in words, with no digits", () => {
    expect(chatGuardFailures("ถ้าไม่ปลอดภัย โทรหาสายด่วนได้นะ พี่อยู่ตรงนี้")).toEqual([]);
    expect(acceptChatReply("ถ้าไม่ปลอดภัย โทรหาสายด่วนได้นะ พี่อยู่ตรงนี้")).toEqual({
      ok: true, text: "ถ้าไม่ปลอดภัย โทรหาสายด่วนได้นะ พี่อยู่ตรงนี้",
    });
  });

  it("does not treat a newline, double space, or space-before-bang as PII", () => {
    expect(chatGuardFailures("พี่อยู่ตรงนี้นะ\nน้องเล่าเพิ่มได้เลย")).toEqual([]);
    expect(chatGuardFailures("พี่อยู่ตรงนี้นะ  น้องเล่าเพิ่มได้เลย")).toEqual([]);
    expect(chatGuardFailures("พี่อยู่ตรงนี้นะ !")).toEqual([]);
    expect(acceptChatReply("พี่อยู่ตรงนี้นะ\nน้องเล่าเพิ่มได้เลย").ok).toBe(true);
  });

  it("still rejects a PII echo that stripPII would actually change", () => {
    expect(chatGuardFailures("แอดไลน์ @user_alpha ได้เลย")).toContain("handle");
    const pii = chatGuardFailures("ส่งมาที่ name@example.com นะ");
    expect(pii).toContain("email");
  });

  it("accepts a warm reply that names ยาคุม or ยาฉุกเฉิน without dosing", () => {
    expect(chatGuardFailures("คุยเรื่องยาคุมได้เลยนะ พี่ฟังอยู่")).toEqual([]);
    expect(chatGuardFailures("เรื่องยาฉุกเฉินน้องเล่าเพิ่มได้เลย")).toEqual([]);
    expect(acceptChatReply("คุยเรื่องยาคุมได้เลยนะ พี่ฟังอยู่").ok).toBe(true);
    expect(acceptChatReply("เรื่องยาฉุกเฉินน้องเล่าเพิ่มได้เลย").ok).toBe(true);
  });

  it("does not treat มก inside คุมกำเนิด as a dose unit", () => {
    expect(chatGuardFailures("วิธีคุมกำเนิดมีหลายแบบเลยนะ")).toEqual([]);
    expect(acceptChatReply("วิธีคุมกำเนิดมีหลายแบบเลยนะ")).toEqual({
      ok: true, text: "วิธีคุมกำเนิดมีหลายแบบเลยนะ",
    });
    expect(chatGuardFailures("กินกี่โมงดีนะ พี่ฟังอยู่")).toEqual([]);
  });

  it("accepts dose and timing mentions; still accepts bare topic nouns", () => {
    expect(chatGuardFailures("กินสองเม็ดก่อนนอนนะ")).toEqual([]);
    expect(chatGuardFailures("ขนาดประมาณสองมก. พอ")).toEqual([]);
    expect(chatGuardFailures("กินกี่เม็ดก่อนนอนนะ")).toEqual([]);
    expect(chatGuardFailures("กินภายในหลังมีเพศสัมพันธ์นะ")).toEqual([]);
    expect(chatGuardFailures("กินวันละหลังอาหารนะ")).toEqual([]);
    expect(chatGuardFailures("กินครั้งละหลังอาหารนะ")).toEqual([]);
    expect(chatGuardFailures("ใช้ยาคุมตามที่กล่องบอก")).toEqual([]);
    expect(acceptChatReply("กินสองเม็ดก่อนนอนนะ").ok).toBe(true);
  });

  it("accepts Thai number words used as a quantity or time next to a unit", () => {
    expect(chatGuardFailures("กินวันละสองครั้งหลังอาหารนะ")).toEqual([]);
    expect(chatGuardFailures("กินภายในสามวันหลังมีเพศสัมพันธ์นะ")).toEqual([]);
    expect(acceptChatReply("กินวันละสองครั้งหลังอาหารนะ").ok).toBe(true);
    expect(acceptChatReply("กินภายในสามวันหลังมีเพศสัมพันธ์นะ").ok).toBe(true);
  });

  it("does not reject Thai number syllables inside ordinary words, or สองคน without a time unit", () => {
    expect(chatGuardFailures("ห้ามกดดันตัวเองนะ พี่อยู่ตรงนี้")).toEqual([]);
    expect(chatGuardFailures("มีเก้าอี้ให้นั่งนะ พี่ฟังอยู่")).toEqual([]);
    expect(chatGuardFailures("สิบปากว่าไม่เท่าตาเห็นนะ พี่ฟังอยู่")).toEqual([]);
    expect(chatGuardFailures("มีสองคนที่น้องห่วงนะ พี่ฟังอยู่")).toEqual([]);
    expect(acceptChatReply("ห้ามกดดันตัวเองนะ พี่อยู่ตรงนี้").ok).toBe(true);
  });

  it("rejects medical-claim patterns, not a bare แน่นอน", () => {
    expect(chatGuardFailures("ทำแบบนี้แล้วไม่ท้องแน่")).toContain("claim");
    expect(chatGuardFailures("ทำแบบนี้แล้วไม่ติดแน่")).toContain("claim");
    expect(chatGuardFailures("พี่รับรองว่าปลอดภัยนะ")).toContain("claim");
    expect(chatGuardFailures("กินแล้วหายขาดเลยนะ")).toContain("claim");
    expect(chatGuardFailures("ปลอดภัย 100 นะ")).toContain("claim");
    expect(chatGuardFailures("พี่อยู่ตรงนี้นะ แน่นอนว่าน้องเล่าได้")).toEqual([]);
    expect(acceptChatReply("พี่อยู่ตรงนี้นะ แน่นอนว่าน้องเล่าได้").ok).toBe(true);
  });

  it("rejects roleplay / explicit / image terms from the input guard lists", () => {
    expect(chatGuardFailures("เราสวมบทบาทเป็นแฟนกันก็ได้นะ")).toContain("roleplay");
    expect(chatGuardFailures("พี่คุยเสียวด้วยก็ได้นะ")).toContain("explicit");
    expect(chatGuardFailures("ส่งรูปมาให้พี่ดูก่อน")).toContain("image");
    expect(chatGuardFailures("คุยเรื่องแฟนได้เลยนะ พี่ฟังอยู่")).toEqual([]);
    expect(chatGuardFailures("พี่ติดตามเรื่องนี้ได้นะ")).toEqual([]);
  });

  it("rejects crisis wording in the model output", () => {
    expect(chatGuardFailures("ถ้าน้องอยากตาย พี่อยู่ตรงนี้")).toContain("crisis");
  });

  it("rejects a PII echo (phone / handle that stripPII would change)", () => {
    expect(chatGuardFailures("พี่จำเบอร์ 0812345678 ไว้นะ")).toContain("phone");
    expect(chatGuardFailures("พี่จำเบอร์ 0812345678 ไว้นะ")).not.toContain("digits");
    expect(chatGuardFailures("แอดไลน์ @user_alpha ได้เลย")).toContain("handle");
  });

  it("strips think tags and accepts the remaining Thai line", () => {
    expect(acceptChatReply("<think>วางแผน</think>พี่อยู่ตรงนี้นะ")).toEqual({
      ok: true, text: "พี่อยู่ตรงนี้นะ",
    });
    expect(acceptChatReply("พี่อยู่ตรงนี้นะ /no_think")).toEqual({
      ok: true, text: "พี่อยู่ตรงนี้นะ",
    });
  });

  it("rejects a reply that echoes the system prompt", () => {
    expect(chatGuardFailures("คุณคือเจน เรียกตัวเองว่าเรา อบอุ่น สั้น ไม่ตัดสิน")).toContain("think");
    expect(acceptChatReply("คุณคือเจน เรียกตัวเองว่าเรา อบอุ่น สั้น ไม่ตัดสิน").ok).toBe(false);
  });

  it("rejects leftover chat-template tokens that are not Thai chat", () => {
    expect(acceptChatReply("<|im_start|>user").ok).toBe(false);
  });

  it("caps a rambling reply instead of rejecting on length", () => {
    const long = "เราฟังอยู่นะคะ " + "เธอเล่าเพิ่มได้เลยค่ะ ".repeat(20);
    expect(long.length).toBeGreaterThan(CHAT_MAX_CHARS);
    const acc = acceptChatReply(long);
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    expect(acc.text.length).toBeLessThanOrEqual(CHAT_MAX_CHARS);
    expect(acc.text.startsWith("เราฟังอยู่นะคะ")).toBe(true);
    expect(chatGuardFailures(long)).not.toContain("length");
  });

  it("rejects mostly non-Thai script", () => {
    expect(chatGuardFailures("Sure I can help you with that today")).toContain("script");
  });

  it("rejects empty / missing output", () => {
    expect(acceptChatReply("").ok).toBe(false);
    expect(acceptChatReply(null).ok).toBe(false);
    expect(acceptChatReply(undefined).ok).toBe(false);
  });
});

const SAFE_EN = "I'm here. You can tell me more whenever you like.";

describe("chatGuard English path", () => {
  it("accepts a short warm English line", () => {
    expect(chatGuardFailures(SAFE_EN, "en")).toEqual([]);
    expect(acceptChatReply(SAFE_EN, "en")).toEqual({ ok: true, text: SAFE_EN });
  });

  it("accepts a warm reply that names birth control or emergency contraception", () => {
    const bc = "You can ask about birth control. I'm here.";
    const ec = "Emergency contraception is okay to ask about.";
    expect(chatGuardFailures(bc, "en")).toEqual([]);
    expect(chatGuardFailures(ec, "en")).toEqual([]);
    expect(acceptChatReply(bc, "en").ok).toBe(true);
    expect(acceptChatReply(ec, "en").ok).toBe(true);
  });

  it("accepts digits in ordinary English chat", () => {
    expect(chatGuardFailures("Wait 2 minutes and tell me more.", "en")).toEqual([]);
    expect(acceptChatReply("Wait 2 minutes and tell me more.", "en").ok).toBe(true);
  });

  it("accepts English number words used as amounts or times next to a unit", () => {
    expect(chatGuardFailures("Take two pills after food.", "en")).toEqual([]);
    expect(chatGuardFailures("Take it within three days.", "en")).toEqual([]);
    expect(chatGuardFailures("Once a day is enough.", "en")).toEqual([]);
    expect(chatGuardFailures("Twice a week after food.", "en")).toEqual([]);
    expect(chatGuardFailures("A half hour is enough.", "en")).toEqual([]);
    expect(chatGuardFailures("Twenty mg with food.", "en")).toEqual([]);
  });

  it("accepts pill(s) per day and take within as dose mentions", () => {
    expect(chatGuardFailures("Pills per day with food is the way.", "en")).toEqual([]);
    expect(chatGuardFailures("Take within a short window.", "en")).toEqual([]);
  });

  it("does not treat a bare pill mention as a dose", () => {
    expect(chatGuardFailures("You can ask about the pill whenever you like.", "en")).toEqual([]);
  });

  it("rejects links, @handles and phone numbers", () => {
    expect(chatGuardFailures("See www.example.com for more.", "en")).toContain("url");
    expect(chatGuardFailures("Ping @teen_helper if you want.", "en")).toContain("handle");
    expect(chatGuardFailures("Call 0812345678 later.", "en")).toContain("phone");
    expect(chatGuardFailures("Call 0812345678 later.", "en")).not.toContain("digits");
  });

  it("rejects absolute medical claims", () => {
    expect(chatGuardFailures("This is 100% safe for you.", "en")).toContain("claim");
    expect(chatGuardFailures("It is guaranteed to work.", "en")).toContain("claim");
    expect(chatGuardFailures("This will cure you for good.", "en")).toContain("claim");
    expect(chatGuardFailures("You definitely have an infection.", "en")).toContain("claim");
    expect(chatGuardFailures("You definitely don't have anything.", "en")).toContain("claim");
    expect(chatGuardFailures("You're not pregnant, I promise.", "en")).toContain("claim");
  });

  it("rejects roleplay and sexual content", () => {
    expect(chatGuardFailures("Let's roleplay as a couple tonight.", "en")).toContain("roleplay");
    expect(chatGuardFailures("Some dirty talk is fine with me.", "en")).toContain("explicit");
    expect(chatGuardFailures("A sexual scene is okay to describe.", "en")).toContain("explicit");
  });

  it("rejects crisis wording", () => {
    expect(chatGuardFailures("If you want to die I'm here.", "en")).toContain("crisis");
  });

  it("caps a rambling English reply instead of rejecting on length", () => {
    const long = "I'm here. " + "You can tell me more whenever you like. ".repeat(20);
    expect(long.length).toBeGreaterThan(CHAT_MAX_CHARS_EN);
    const acc = acceptChatReply(long, "en");
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    expect(acc.text.length).toBeLessThanOrEqual(CHAT_MAX_CHARS_EN);
    expect(chatGuardFailures(long, "en")).not.toContain("length");
    expect(chatGuardFailures(SAFE, "th")).not.toContain("length");
    expect(SAFE_EN.length).toBeLessThanOrEqual(CHAT_MAX_CHARS_EN);
  });

  it("fails a reply in the wrong language for the turn", () => {
    expect(chatGuardFailures(SAFE, "en")).toContain("script");
    expect(chatGuardFailures(SAFE_EN, "th")).toContain("script");
    expect(acceptChatReply(SAFE, "en").ok).toBe(false);
    expect(acceptChatReply(SAFE_EN, "th").ok).toBe(false);
  });
});

describe("chatGuard round-3 claim / price holes (doses are allowed)", () => {
  it.each([
    "ตรวจเลือดพรุ่งนี้ก็รู้ผลแล้วค่ะ",
    "ถ้ากินทันทีจะไม่ท้องค่ะ",
    "ราคาประมาณห้าร้อยบาทนะ",
  ])("rejects the Thai output %s", (line) => {
    expect(acceptChatReply(line).ok).toBe(false);
  });

  it.each([
    "You will definitely not get pregnant.",
    "It costs fifty baht.",
  ])("rejects the English output %s", (line) => {
    expect(acceptChatReply(line, "en").ok).toBe(false);
  });

  it("accepts dose mentions that round 3 used to reject", () => {
    expect(chatGuardFailures("กินเม็ดเดียวก่อนนอนนะ")).toEqual([]);
    expect(acceptChatReply("กินเม็ดเดียวก่อนนอนนะ").ok).toBe(true);
    expect(chatGuardFailures("Take two emergency contraceptive pills now.", "en")).toEqual([]);
    expect(acceptChatReply("Take two emergency contraceptive pills now.", "en").ok).toBe(true);
  });

  it("names the claim / price reasons for the round-3 cases", () => {
    expect(chatGuardFailures("ตรวจเลือดพรุ่งนี้ก็รู้ผลแล้วค่ะ")).toContain("claim");
    expect(chatGuardFailures("ถ้ากินทันทีจะไม่ท้องค่ะ")).toContain("claim");
    expect(chatGuardFailures("You will definitely not get pregnant.", "en")).toContain("claim");
    expect(chatGuardFailures("ราคาประมาณห้าร้อยบาทนะ")).toContain("price");
    expect(chatGuardFailures("It costs fifty baht.", "en")).toContain("price");
  });

  it("still accepts warm Thai replies that are not doses, claims, or prices", () => {
    const thai = [
      "คุยเรื่องยาคุมได้เลยนะ พี่ฟังอยู่",
      "เรื่องยาฉุกเฉินน้องเล่าเพิ่มได้เลย",
      "วิธีคุมกำเนิดมีหลายแบบเลยนะ",
      "พี่อยู่ตรงนี้นะ แน่นอนว่าน้องเล่าได้",
      "อยากรู้เรื่องราคาก็ถามคลินิกได้นะ",
      "ผลตรวจคุยกับเจ้าหน้าที่ได้นะ พี่ฟังอยู่",
      "กินข้าวก่อนค่อยเล่าได้เลยนะ",
      "ท้องหรือเปล่าเล่ามาได้เลย พี่อยู่ตรงนี้",
      "พรุ่งนี้มาเล่าเพิ่มได้เลยนะ",
    ];
    for (const line of thai) {
      expect(chatGuardFailures(line), line).toEqual([]);
      expect(acceptChatReply(line).ok, line).toBe(true);
    }
  });

  it("still accepts warm English replies that are not doses, claims, or prices", () => {
    const english = [
      "You can ask about birth control. I'm here.",
      "Emergency contraception is okay to ask about.",
      "You can ask about the pill whenever you like.",
      "Clinic staff can talk about cost with you.",
      "Test results are something a nurse can explain.",
      "Take your time. I'm here.",
      "Pregnancy questions are okay to ask about.",
      "I'm here if you want to talk more.",
    ];
    for (const line of english) {
      expect(chatGuardFailures(line, "en"), line).toEqual([]);
      expect(acceptChatReply(line, "en").ok, line).toBe(true);
    }
  });
});
