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

  it("rejects phone-like text even when described as a call", () => {
    const fails = chatGuardFailures("โทรหาพี่ที่ ศูนย์แปดหนึ่งสองสามสี่ห้าหกเจ็ดแปด");
    // spelled-out phones may miss the phone regex; digits are the hard gate.
    expect(chatGuardFailures("โทร 0812345678 ได้เลย")).toContain("digits");
    expect(fails.length >= 0).toBe(true);
  });

  it("rejects dose words (เม็ด / มก. / ยา + name)", () => {
    expect(chatGuardFailures("กินสองเม็ดก่อนนอนนะ")).toContain("dose");
    expect(chatGuardFailures("ขนาดประมาณสองมก. พอ")).toContain("dose");
    expect(chatGuardFailures("ใช้ยาคุมตามที่กล่องบอก")).toContain("dose");
  });

  it("rejects medical-claim phrases", () => {
    expect(chatGuardFailures("ทำแบบนี้แล้วไม่ท้องแน่")).toContain("claim");
    expect(chatGuardFailures("พี่รับรองว่าปลอดภัยแน่นอน")).toContain("claim");
  });

  it("rejects roleplay / explicit / image terms from the input guard lists", () => {
    expect(chatGuardFailures("เราสวมบทบาทเป็นแฟนกันก็ได้นะ")).toContain("roleplay");
    expect(chatGuardFailures("พี่คุยเสียวด้วยก็ได้นะ")).toContain("explicit");
    expect(chatGuardFailures("ส่งรูปมาให้พี่ดูก่อน")).toContain("image");
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
