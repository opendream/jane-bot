import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { newChat, sendToChat, type ChatHooks } from "../../src/ui/chat";
import {
  DEFAULT_CHAT_CHOICE_JSON,
  defaultChatReply,
  formatChatReply,
} from "../../src/llm/chat-choice";
import { CHAT_FOLLOWUPS_TH, CHAT_OPENERS_TH } from "../../src/llm/chat-voice";

// SYNTHETIC chat lines only. Model stubs return JSON; Jane's text is rendered.
const NONE_JSON = DEFAULT_CHAT_CHOICE_JSON;
const WHOLE_JSON = '{"o":0,"c":1,"q":0}';
const OPENER = CHAT_OPENERS_TH[0]!;
const FOLLOW = CHAT_FOLLOWUPS_TH[0]!;
const LEAK = BANK.find((c) => c.id === "condom.leak.000")!;
/** Direct question → card bubble on this turn. */
const SHOW_CARD_Q = "ถุงยางแตกต้องทำยังไง";
/** Same topic, not a direct question → chat only, no card bubble. */
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

describe("c=1 does not duplicate the card when the card bubble also shows", () => {
  it("c=1 plus a shown card: answer_th appears exactly once on that turn", async () => {
    const model = spyModel(WHOLE_JSON);
    const chat = newChat("18-24", model, null, { chatFirst: true });
    await sendToChat(chat, SHOW_CARD_Q, hooks());
    const jane = janeThisTurn(chat.messages, SHOW_CARD_Q);
    expect(countNeedle(jane.map((m) => m.text), LEAK.answer_th)).toBe(1);
    const chatBubble = jane.find((m) => !m.cardId);
    const cardBubble = jane.find((m) => m.cardId);
    expect(chatBubble?.text).toBe(formatChatReply(OPENER, "", FOLLOW));
    expect(chatBubble?.text).not.toContain(LEAK.answer_th);
    expect(cardBubble?.cardId).toBe(LEAK.id);
    expect(cardBubble?.text).toBe(LEAK.answer_th);
  });

  it("runTurn: c=1 plus a shown card keeps answer_th on the card bubble only", async () => {
    const r = await runTurn(newDialog(), SHOW_CARD_Q, deps(spyModel(WHOLE_JSON)));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card?.id).toBe(LEAK.id);
    expect(r.reply.cardText).toBe(LEAK.answer_th);
    expect(r.reply.text).toBe(formatChatReply(OPENER, "", FOLLOW));
    expect(r.reply.text).not.toContain(LEAK.answer_th);
  });

  it("c=1 with no card bubble still shows the card in the chat bubble", async () => {
    const chat = newChat("18-24", spyModel(WHOLE_JSON), null, { chatFirst: true });
    await sendToChat(chat, CHAT_ONLY_Q, hooks());
    const jane = janeThisTurn(chat.messages, CHAT_ONLY_Q);
    expect(jane).toHaveLength(1);
    expect(jane[0]!.cardId).toBeFalsy();
    expect(jane[0]!.text).toBe(formatChatReply(OPENER, LEAK.answer_th, FOLLOW));
    expect(jane[0]!.text).toContain(LEAK.answer_th);

    const r = await runTurn(newDialog(), CHAT_ONLY_Q, deps(spyModel(WHOLE_JSON)));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card).toBeNull();
    expect(r.reply.cardText).toBeNull();
    expect(r.reply.text).toBe(formatChatReply(OPENER, LEAK.answer_th, FOLLOW));
  });

  it("c=0 is unchanged with or without a card bubble", async () => {
    const chatShown = newChat("18-24", spyModel(NONE_JSON), null, { chatFirst: true });
    await sendToChat(chatShown, SHOW_CARD_Q, hooks());
    const shown = janeThisTurn(chatShown.messages, SHOW_CARD_Q);
    expect(countNeedle(shown.map((m) => m.text), LEAK.answer_th)).toBe(1);
    expect(shown.find((m) => !m.cardId)?.text).toBe(defaultChatReply("th"));
    expect(shown.find((m) => m.cardId)?.text).toBe(LEAK.answer_th);

    const chatOnly = newChat("18-24", spyModel(NONE_JSON), null, { chatFirst: true });
    await sendToChat(chatOnly, CHAT_ONLY_Q, hooks());
    const only = janeThisTurn(chatOnly.messages, CHAT_ONLY_Q);
    expect(only).toHaveLength(1);
    expect(only[0]!.cardId).toBeFalsy();
    expect(only[0]!.text).toBe(defaultChatReply("th"));
    expect(only[0]!.text).not.toContain(LEAK.answer_th);
  });
});
