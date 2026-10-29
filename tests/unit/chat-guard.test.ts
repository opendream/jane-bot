import { describe, expect, it } from "vitest";
import { CHAT_HOLDING_LINE, acceptChatReply, chatGuardFailures } from "../../src/llm/chatGuard";

// SYNTHETIC strings only — never real names, phones, or clinical claims.

const SAFE = "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";

describe("chatGuard (generated Jane replies)", () => {
  it("accepts a short warm Thai line with no numbers or claims", () => {
    expect(chatGuardFailures(SAFE)).toEqual([]);
    expect(acceptChatReply(SAFE)).toEqual({ ok: true, text: SAFE });
  });

  it("rejects Arabic digits", () => {
    expect(chatGuardFailures("กินภายใน 72 ชั่วโมงนะ")).toContain("digits");
    expect(acceptChatReply("รอ 1 นาที").ok).toBe(false);
  });

  it("rejects Thai digits", () => {
    expect(chatGuardFailures("รอแป๊บ ๓ นาทีนะ")).toContain("digits");
  });

  it("rejects URLs", () => {
    expect(chatGuardFailures("ดูที่ www.example.com นะ")).toContain("url");
    expect(chatGuardFailures("เปิด https://example.org/help")).toContain("url");
  });

  it("rejects @handles and emails", () => {
    expect(chatGuardFailures("แอดมา @teen_helper ได้เลย")).toContain("handle");
    expect(chatGuardFailures("ส่งมาที่ name@example.com นะ")).toContain("email");
  });

  it("rejects a digit phone number", () => {
    expect(chatGuardFailures("โทร 0812345678 ได้เลย")).toContain("digits");
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

  it("rejects dose and timing patterns, not bare topic nouns", () => {
    expect(chatGuardFailures("กินสองเม็ดก่อนนอนนะ")).toContain("dose");
    expect(chatGuardFailures("ขนาดประมาณสองมก. พอ")).toContain("dose");
    expect(chatGuardFailures("กินกี่เม็ดก่อนนอนนะ")).toContain("dose");
    expect(chatGuardFailures("กินภายในหลังมีเพศสัมพันธ์นะ")).toContain("dose");
    expect(chatGuardFailures("กินวันละหลังอาหารนะ")).toContain("dose");
    expect(chatGuardFailures("กินครั้งละหลังอาหารนะ")).toContain("dose");
    expect(chatGuardFailures("ใช้ยาคุมตามที่กล่องบอก")).not.toContain("dose");
  });

  it("rejects Thai number words used as a quantity or time next to a unit", () => {
    expect(chatGuardFailures("กินวันละสองครั้งหลังอาหารนะ")).toContain("dose");
    expect(chatGuardFailures("กินภายในสามวันหลังมีเพศสัมพันธ์นะ")).toContain("dose");
    expect(acceptChatReply("กินวันละสองครั้งหลังอาหารนะ").ok).toBe(false);
    expect(acceptChatReply("กินภายในสามวันหลังมีเพศสัมพันธ์นะ").ok).toBe(false);
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
    expect(chatGuardFailures("พี่จำเบอร์ 0812345678 ไว้นะ")).toContain("digits");
    expect(chatGuardFailures("แอดไลน์ @user_alpha ได้เลย")).toContain("handle");
  });

  it("rejects think tags and chat-template tokens", () => {
    expect(chatGuardFailures("<think>วางแผน</think>พี่อยู่ตรงนี้นะ")).toContain("think");
    expect(chatGuardFailures("พี่อยู่ตรงนี้นะ /no_think")).toContain("think");
    expect(chatGuardFailures("<|im_start|>user")).toContain("think");
  });

  it("rejects replies longer than 160 characters", () => {
    const long = "พี่อยู่ตรงนี้นะ " + "น้องเล่าเพิ่มได้เลย ".repeat(12);
    expect(long.length).toBeGreaterThan(160);
    expect(chatGuardFailures(long)).toContain("length");
  });

  it("rejects mostly non-Thai script", () => {
    expect(chatGuardFailures("Sure I can help you with that today")).toContain("script");
  });

  it("rejects empty / missing output", () => {
    expect(acceptChatReply("").ok).toBe(false);
    expect(acceptChatReply(null).ok).toBe(false);
    expect(acceptChatReply(undefined).ok).toBe(false);
  });

  it("the holding line itself passes the guard", () => {
    expect(chatGuardFailures(CHAT_HOLDING_LINE)).toEqual([]);
    expect(CHAT_HOLDING_LINE.length).toBeLessThanOrEqual(160);
  });
});
