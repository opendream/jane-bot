import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { debugEnabled } from "../../src/config";
import { acceptChatReply, chatGuardFailures, normaliseChatReply } from "../../src/llm/chatGuard";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

// SYNTHETIC strings only — never real names, phones, or clinical claims.

const ADVICE = [
  "กินยาคุมฉุกเฉินได้เลยค่ะ",
  "กินยาคุมฉุกเฉินได้นะคะ",
  "แนะนำยาคุมฉุกเฉินค่ะ",
  "ไปฉีดยาคุมได้เลยค่ะ",
] as const;

const deps = (model: DialogModel, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "reviewed", chatFirst: true, ...extra,
});

describe("product ruling: Jane answers freely including advice", () => {
  it.each([...ADVICE])("acceptChatReply accepts %s (ok=true)", (line) => {
    expect(chatGuardFailures(line), line).not.toContain("advice");
    expect(acceptChatReply(line).ok, line).toBe(true);
    expect(acceptChatReply(line)).toEqual({ ok: true, text: line });
  });

  it.each([...ADVICE])("runTurn renders %s as Jane, not a bank card", async (line) => {
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async () => line),
    };
    const r = await runTurn(newDialog("18-24"), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(model.chatReply).toHaveBeenCalled();
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.text).toBe(line);
    expect(r.reply.card).toBeNull();
  });
});

describe("realistic 0.6B raw output is accepted after normalisation", () => {
  it("strips a Qwen3 think block and a Jane: role prefix", () => {
    const raw = "<think>user is worried, stay warm and short</think>\nJane: กินยาคุมฉุกเฉินได้เลยค่ะ";
    expect(normaliseChatReply(raw)).toBe("กินยาคุมฉุกเฉินได้เลยค่ะ");
    expect(acceptChatReply(raw).ok).toBe(true);
    expect(acceptChatReply(raw)).toEqual({ ok: true, text: "กินยาคุมฉุกเฉินได้เลยค่ะ" });
  });

  it("strips an assistant role prefix and keeps a PrEP loanword line", () => {
    const raw = "assistant: เธอใช้ PrEP ได้เลยนะคะ เราฟังอยู่ค่ะ";
    const acc = acceptChatReply(raw);
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    expect(acc.text).toBe("เธอใช้ PrEP ได้เลยนะคะ เราฟังอยู่ค่ะ");
    expect(acc.text).toContain("PrEP");
  });

  it("trims a 128-token-style cut-off to the last complete sentence instead of rejecting", () => {
    const complete = "เราฟังอยู่นะคะ เธอเล่าเรื่องประจำเดือนต่อได้เลยค่ะ";
    const dangling = " แล้วถ้าเธอยากินยาคุมฉุกเฉินหรือใช้ PrEP ในช่วงที่เพิ่งมีอะไรกับแฟนแล้วลืมกินยาคุมและยังกังวลเรื่องท้องอยู่";
    const raw = complete + dangling + dangling;
    expect(raw.length).toBeGreaterThan(160);
    expect(raw.endsWith("ค่ะ")).toBe(false);
    const acc = acceptChatReply(raw);
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    expect(acc.text).toBe(complete);
  });

  it("kitchen-sink raw 0.6B dump (think, role, markdown, PrEP, mid-sentence cut) becomes Jane chat", async () => {
    const raw = [
      "<think>",
      "The user missed a pill. Two short sentences. Be warm.",
      "</think>",
      "**Jane:** เราฟังอยู่นะคะ เธอเล่าเรื่องที่ลืมกินยาคุมต่อได้เลยค่ะ ถ้าเธอใช้ PrEP หรือยาคุมฉุกเฉินในช่วงนี้ก็สามารถ",
    ].join("\n");
    expect(acceptChatReply(raw).ok).toBe(true);
    expect(acceptChatReply(raw)).toEqual({
      ok: true,
      text: "เราฟังอยู่นะคะ เธอเล่าเรื่องที่ลืมกินยาคุมต่อได้เลยค่ะ",
    });

    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async () => raw),
    };
    const r = await runTurn(newDialog("18-24"), "ลืมกินยาคุม กลัวท้อง", deps(model));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.text).toBe("เราฟังอยู่นะคะ เธอเล่าเรื่องที่ลืมกินยาคุมต่อได้เลยค่ะ");
    expect(r.reply.card).toBeNull();
  });
});

describe("dialog: the fixed three-turn flow still chats with no forced card", () => {
  it("ปวดประจำเดือน / แล้วถ้ามาช้ากว่าปกตินิดหน่อยละ / มีอะไรกับแฟนด้วย แล้วลืมกินยาคุม กลัวท้อง", async () => {
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

describe("?debug=1 shows guard reason codes only, off by default", () => {
  it("debugEnabled is off unless ?debug=1", () => {
    expect(debugEnabled("")).toBe(false);
    expect(debugEnabled("?chatFirst=1")).toBe(false);
    expect(debugEnabled("?debug=0")).toBe(false);
    expect(debugEnabled("?debug=1")).toBe(true);
    expect(debugEnabled("?debug=true")).toBe(true);
    expect(debugEnabled("?debug=on")).toBe(true);
  });

  it("a genuine non-advice guard fail attaches reason codes, not the raw text", async () => {
    const leak = "กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test";
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async () => leak),
    };
    const r = await runTurn(newDialog("18-24"), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind !== "card") return;
    expect(r.reply.chatGuardReasons?.length).toBeGreaterThan(0);
    expect(r.reply.chatGuardReasons).not.toContain("advice");
    expect(JSON.stringify(r.reply)).not.toContain("evil.test");
    expect(r.reply.text).toBe(r.reply.card.answer_th);
    expect(r.reply.text).not.toBe(leak);
  });
});
