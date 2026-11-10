import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { newChat, sendToChat, type ChatHooks } from "../../src/ui/chat";
import { SHOW_CARD_NOW } from "../../src/core/chat-flow";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

const SAFE = STUB_CHAT_REPLY_TH;
const LEAK = BANK.find((c) => c.id === "condom.leak.000")!;
const CHAT_ONLY_Q = "ถุงยางแตกทำไงดี";

function spyModel(reply: string): DialogModel {
  return {
    ready: () => true,
    chatReply: vi.fn(async () => reply),
    pickCard: vi.fn(async () => "none"),
  };
}

const deps = (model: DialogModel): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft", chatFirst: true,
});

function hooks(): ChatHooks {
  return { rerender: () => {}, crisis: () => {} };
}

function janeThisTurn(messages: { from: string; text: string; cardId?: string }[], userText: string) {
  const i = messages.findIndex((m) => m.from === "user" && m.text === userText);
  if (i < 0) throw new Error(`missing user turn: ${userText}`);
  return messages.slice(i + 1).filter((m) => m.from === "jane");
}

function countNeedle(texts: string[], needle: string): number {
  return texts.filter((t) => t.includes(needle)).length;
}

describe("chat text does not quote the bank card", () => {
  it("a model reply is chat-only and does not include answer_th", async () => {
    const chat = newChat("18-24", spyModel(SAFE), null, { chatFirst: true });
    await sendToChat(chat, CHAT_ONLY_Q, hooks());
    const jane = janeThisTurn(chat.messages, CHAT_ONLY_Q);
    expect(jane).toHaveLength(1);
    expect(jane[0]!.cardId).toBeFalsy();
    expect(jane[0]!.text).toBe(SAFE);
    expect(jane[0]!.text).not.toContain(LEAK.answer_th);

    const r = await runTurn(newDialog(), CHAT_ONLY_Q, deps(spyModel(SAFE)));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card).toBeNull();
    expect(r.reply.text).toBe(SAFE);
    expect(r.reply.text).not.toContain(LEAK.answer_th);
  });

  it("ขอข้อมูลเลย shows the bank answer once, on the card bubble", async () => {
    const model = spyModel(SAFE);
    const chat = newChat("18-24", model, null, { chatFirst: true });
    await sendToChat(chat, CHAT_ONLY_Q, hooks());
    await sendToChat(chat, SHOW_CARD_NOW, hooks());
    const jane = janeThisTurn(chat.messages, SHOW_CARD_NOW);
    expect(countNeedle(jane.map((m) => m.text), LEAK.answer_th)).toBe(1);
    expect(jane.find((m) => m.cardId)?.cardId).toBe(LEAK.id);
    expect(jane.find((m) => m.cardId)?.text).toBe(LEAK.answer_th);
  });
});
