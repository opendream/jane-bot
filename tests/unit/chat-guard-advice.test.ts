import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { acceptChatReply, chatGuardFailures } from "../../src/llm/chatGuard";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

// SYNTHETIC strings only — never real names, phones, or clinical claims.

const ADVICE_TH = "กินยาคุมฉุกเฉินได้เลยค่ะ";

const deps = (model: DialogModel, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "reviewed", chatFirst: true, ...extra,
});

describe("chatGuard rejects medication / method advice", () => {
  it("rejects กินยาคุมฉุกเฉินได้เลยค่ะ and does not accept it as Jane", () => {
    expect(chatGuardFailures(ADVICE_TH)).toContain("advice");
    expect(acceptChatReply(ADVICE_TH).ok).toBe(false);
  });

  it.each([
    "กินยาคุมฉุกเฉินได้เลยค่ะ",
    "ให้กินยาแก้ปวดก่อนนอนนะ",
    "ควรกินยาคุมฉุกเฉินเลยค่ะ",
    "ลองกินยาคุมได้นะคะ",
    "ใช้ยาคุมฉุกเฉินเลยค่ะ",
    "กิน PrEP ได้เลยค่ะ",
    "ใช้ PEP เลยนะ",
  ])("rejects the Thai advice line %s", (line) => {
    expect(chatGuardFailures(line), line).toContain("advice");
    expect(acceptChatReply(line).ok, line).toBe(false);
  });

  it.each([
    "Take emergency contraception now.",
    "You should take Plan B.",
    "You can take PrEP today.",
    "Just use PEP.",
    "Try taking the pill tonight.",
    "Take two mg of ibuprofen with food.",
  ])("rejects the English advice line %s", (line) => {
    expect(chatGuardFailures(line, "en"), line).toContain("advice");
    expect(acceptChatReply(line, "en").ok, line).toBe(false);
  });

  it.each([
    "ประจำเดือนรอบนี้มาช้ากว่าปกติไหมคะ",
    "ลองไปถามหมอหรือคลินิกได้นะคะ",
    "ไปปรึกษาเภสัชกรได้เลยนะคะ",
    "ดูการ์ดด้านล่างได้เลยนะคะ",
    "เราฟังอยู่นะคะ เธอเล่าเพิ่มได้เลยค่ะ",
    "คุยเรื่องยาคุมได้เลยนะ เราฟังอยู่",
    "เธอกินยาคุมอยู่ไหมคะ",
    "เรื่องยาฉุกเฉินเธอเล่าเพิ่มได้เลย",
  ])("accepts the safe Thai chat line %s", (line) => {
    expect(chatGuardFailures(line), line).toEqual([]);
    expect(acceptChatReply(line).ok, line).toBe(true);
  });

  it.each([
    "Take your time. I'm here.",
    "You can ask about the pill whenever you like.",
    "Emergency contraception is okay to ask about.",
    "A clinic or pharmacist can talk this through with you.",
    "See a doctor if you want more detail.",
    "I hear you. You can tell me more.",
  ])("accepts the safe English chat line %s", (line) => {
    expect(chatGuardFailures(line, "en"), line).toEqual([]);
    expect(acceptChatReply(line, "en").ok, line).toBe(true);
  });
});

describe("dialog: advice replies are not rendered as Jane", () => {
  it("กินยาคุมฉุกเฉินได้เลยค่ะ is rejected and the reviewed-card fallback is shown", async () => {
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async () => ADVICE_TH),
    };
    const r = await runTurn(newDialog("18-24"), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(model.chatReply).toHaveBeenCalled();
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind !== "card") return;
    expect(r.reply.text).toBe(r.reply.card.answer_th);
    expect(r.reply.text).not.toBe(ADVICE_TH);
    expect(r.reply.text).not.toContain("กินยาคุมฉุกเฉินได้เลย");
  });

  it("the fixed three-turn flow still chats with safe mocked replies and no card", async () => {
    const FLOW = [
      "ปวดประจำเดือน",
      "แล้วถ้ามาช้ากว่าปกตินิดหน่อยละ",
      "มีอะไรกับแฟนด้วย แล้วลืมกินยาคุม กลัวท้อง",
    ] as const;
    const replies = [
      "เราฟังอยู่นะคะ เธอเล่าเรื่องประจำเดือนต่อได้เลยค่ะ",
      "เราเข้าใจค่ะ เธอเล่าต่อได้เลยนะคะ",
      "เราอยู่ตรงนี้ค่ะ เธอเล่าเรื่องยาคุมต่อได้เลยนะคะ",
    ];
    let n = 0;
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async () => replies[n++] ?? STUB_CHAT_REPLY_TH),
    };
    let st = newDialog("18-24");
    const kinds: string[] = [];
    const texts: string[] = [];
    for (const line of FLOW) {
      const out = await runTurn(st, line, deps(model, { copyStatus: "draft" }));
      st = out.state;
      kinds.push(out.reply.kind);
      texts.push(out.reply.kind === "chat" ? out.reply.text : "");
    }
    expect(kinds).toEqual(["chat", "chat", "chat"]);
    expect(texts).toEqual(replies);
    expect(model.chatReply).toHaveBeenCalledTimes(3);
  });
});
