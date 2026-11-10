import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { acceptChatReply, chatGuardFailures } from "../../src/llm/chatGuard";

// SYNTHETIC strings only — never real names, phones, or clinical claims.
// 9999 is a made-up hotline. 1663 appears only as the invented-reply leak the
// guard must block (the bank already cites it; Jane chat must not).

const HOTLINE_WORDS = "โทรสายด่วน 9999 ได้เลยค่ะ";
const HOTLINE_HA = "โทรหา 1663 ได้เลยค่ะ";
const HOTLINE_IMMEDIATE = "โทร0812345678 ได้เลยค่ะ";
const HOTLINE_IMMEDIATE_SPACE = "โทร 0812345678 ได้เลย";

function expectPhoneReject(line: string, lang: "th" | "en" = "th") {
  const acc = acceptChatReply(line, lang);
  expect(acc.ok, line).toBe(false);
  if (acc.ok) return;
  expect(acc.reasons, line).toContain("phone");
  expect(chatGuardFailures(line, lang), line).toContain("phone");
  expect(chatGuardFailures(line, lang), line).not.toContain("digits");
}

const deps = (model: DialogModel): TurnDeps => ({
  cards: BANK, model, copyStatus: "reviewed", chatFirst: true,
});

describe("chatGuard phone: call word then 3+ digits in a short window", () => {
  it('acceptChatReply("โทรสายด่วน 9999 ได้เลยค่ะ") is ok=false, reason phone', () => {
    expectPhoneReject(HOTLINE_WORDS);
  });

  it('acceptChatReply("โทรหา 1663 ได้เลยค่ะ") is ok=false, reason phone', () => {
    expectPhoneReject(HOTLINE_HA);
  });

  it("still rejects โทร followed immediately by digits (compact and spaced)", () => {
    expectPhoneReject(HOTLINE_IMMEDIATE);
    expectPhoneReject(HOTLINE_IMMEDIATE_SPACE);
  });

  it("rejects ติดต่อ / สายด่วน / call / hotline when a 3+ digit number follows nearby", () => {
    expectPhoneReject("ติดต่อสายด่วน 9999 ได้เลยค่ะ");
    expectPhoneReject("สายด่วน 9999 ได้เลยค่ะ");
    expectPhoneReject("โทรสายด่วน ๙๙๙๙ ได้เลยค่ะ");
    expectPhoneReject("โทรสายด่วน 9-9-9-9 ได้เลยค่ะ");
    expectPhoneReject("Call 999 later. I'm here.", "en");
    expectPhoneReject("The hotline 9999 is open if you need it.", "en");
  });

  it("accepts days, ages, and 72 ชั่วโมง when there is no call word", () => {
    const ok = [
      "กินภายใน 72 ชั่วโมงนะ",
      "รอแป๊บ ๓ นาทีนะ",
      "อายุ 18 ปีนะ พี่ฟังอยู่",
      "รอผลประมาณ 21 วันได้นะ พี่อยู่ตรงนี้",
      "ประจำเดือนมาช้า 3-7 วันถือว่าปกติได้นะ",
    ];
    for (const line of ok) {
      expect(chatGuardFailures(line), line).toEqual([]);
      expect(acceptChatReply(line).ok, line).toBe(true);
    }
  });

  it("accepts a call-in-words line with no digits, plus advice and dose replies", () => {
    const ok = [
      "ถ้าไม่ปลอดภัย โทรหาสายด่วนได้นะ พี่อยู่ตรงนี้",
      "กินยาคุมฉุกเฉินได้เลยค่ะ",
      "กิน 1 เม็ดภายใน 72 ชั่วโมง",
    ];
    for (const line of ok) {
      expect(chatGuardFailures(line), line).toEqual([]);
      expect(acceptChatReply(line).ok, line).toBe(true);
    }
  });
});

describe("chat-first dialog: invented hotline falls back to a bank card", () => {
  it.each([HOTLINE_WORDS, HOTLINE_HA])(
    "after retry, the user sees a bank card, not %s",
    async (line) => {
      const model: DialogModel = {
        ready: () => true,
        chatReply: vi.fn(async () => line),
      };
      const r = await runTurn(newDialog("18-24"), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
      expect(model.chatReply).toHaveBeenCalledTimes(2);
      expect(r.reply.kind).toBe("card");
      if (r.reply.kind !== "card") return;
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.text).not.toBe(line);
      expect(r.reply.text).not.toContain("9999");
      expect(r.reply.chatGuardReasons).toContain("phone");
    },
  );
});
