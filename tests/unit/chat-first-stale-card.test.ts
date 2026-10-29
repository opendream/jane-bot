import { afterEach, describe, expect, it } from "vitest";
import { DialogSession, type DialogModel, type TurnDeps, type TurnReply } from "../../src/core/dialog";
import { BANK } from "../../src/core/bankData";
import { newChat, sendToChat, type ChatHooks } from "../../src/ui/chat";
import { isAckLine } from "../../src/core/chat-group";
import {
  currentGenerationToken,
  resetGenerationTokenForTests,
} from "../../src/llm/generation-token";

const SAFE_CHAT = "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";
const CONDOM_Q = "ถุงยางแตกต้องทำยังไง";
const THANKS = "ขอบคุณค่ะ";
const LEAK_ID = "condom.leak.000";

afterEach(() => {
  resetGenerationTokenForTests();
});

function deps(model: DialogModel | null = null, extra: Partial<TurnDeps> = {}): TurnDeps {
  return { cards: BANK, model, copyStatus: "draft", chatFirst: true, ...extra };
}

function chatModel(opts: { delayMs?: number; pick?: "top" | "none" } = {}) {
  const delayMs = opts.delayMs ?? 0;
  const pick = opts.pick ?? "top";
  const calls = { chat: 0, pick: 0, started: 0 };
  const model: DialogModel = {
    ready: () => true,
    chatReply: async (_text, _history, signal) => {
      calls.started++;
      if (delayMs > 0) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, delayMs);
          const onAbort = () => { clearTimeout(t); resolve(); };
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort, { once: true });
        });
        if (signal?.aborted) return null;
      }
      calls.chat++;
      return SAFE_CHAT;
    },
    pickCard: async (_text, list) => {
      calls.pick++;
      return pick === "none" ? "none" : (list[0]?.id ?? "none");
    },
  };
  return { model, calls };
}

function hooks(): ChatHooks {
  return { rerender: () => {}, crisis: () => {} };
}

async function waitUntil(fn: () => boolean, ms = 400) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function cardAfterUser(messages: { from: string; text: string; cardId?: string }[], userText: string): string[] {
  const i = messages.findIndex((m) => m.from === "user" && m.text === userText);
  if (i < 0) return [];
  return messages.slice(i + 1).filter((m) => m.from === "jane" && m.cardId).map((m) => m.cardId!);
}

function leakCard(): NonNullable<Extract<TurnReply, { kind: "chat" }>["card"]> {
  const card = BANK.find((c) => c.id === LEAK_ID);
  if (!card) throw new Error("missing leak card");
  return card;
}

describe("chat-first: thanks / small talk never inherit an earlier card", () => {
  it("recognises thanks as an ack line with no matched topic", () => {
    expect(isAckLine(THANKS)).toBe(true);
    expect(isAckLine("thanks")).toBe(true);
    expect(isAckLine("thank you")).toBe(true);
    expect(isAckLine(CONDOM_Q)).toBe(false);
  });

  it("a thanks after an open condom topic does not close with that card", async () => {
    const { model, calls } = chatModel({ pick: "top" });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const first = await s.send("ถุงยางแตกค่ะ");
    expect(first?.kind).toBe("chat");
    if (first?.kind === "chat") expect(first.card).toBeNull();
    const thanks = await s.send(THANKS);
    expect(thanks?.kind).toBe("chat");
    if (thanks?.kind === "chat") {
      expect(thanks.card).toBeNull();
      expect(thanks.cardText).toBeNull();
      expect(thanks.text).toBe(SAFE_CHAT);
    }
    expect(calls.chat).toBeGreaterThan(0);
  });

  it("thanks typed mid-generation is grouped but still has no earlier card", async () => {
    const { model, calls } = chatModel({ delayMs: 80, pick: "top" });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send(CONDOM_Q);
    await waitUntil(() => calls.started > 0);
    const p2 = s.send(THANKS);
    expect(await p1).toBeNull();
    const r2 = await p2;
    expect(r2?.kind).toBe("chat");
    if (r2?.kind === "chat") {
      expect(r2.card).toBeNull();
      expect(r2.cardText).toBeNull();
      expect(r2.text).toBe(SAFE_CHAT);
    }
  });

  it("the UI does not attach the condom card under the thanks turn", async () => {
    const { model } = chatModel({ pick: "top" });
    const chat = newChat("18+", model, null, { chatFirst: true });
    const h = hooks();
    await sendToChat(chat, "ถุงยางแตกค่ะ", h);
    await sendToChat(chat, THANKS, h);
    expect(cardAfterUser(chat.messages, THANKS)).not.toContain(LEAK_ID);
    const lastJane = [...chat.messages].reverse().find((m) => m.from === "jane");
    expect(lastJane?.cardId === LEAK_ID).toBe(false);
  });

  it("a superseded generation result cannot render a card under a newer turn", async () => {
    const { model } = chatModel({ pick: "top" });
    const chat = newChat("18+", model, null, { chatFirst: true });
    const h = hooks();
    const orig = chat.session.send.bind(chat.session);
    let finishFirst!: (r: TurnReply | null) => void;
    chat.session.send = (text, extra) => {
      if (text.includes("ถุงยาง")) {
        return new Promise((resolve) => { finishFirst = resolve; });
      }
      return orig(text, extra);
    };
    const p1 = sendToChat(chat, CONDOM_Q, h);
    await waitUntil(() => chat.messages.some((m) => m.from === "user" && m.text === CONDOM_Q));
    chat.session.send = orig;
    await sendToChat(chat, THANKS, h);
    const staleToken = currentGenerationToken() - 1;
    const card = leakCard();
    finishFirst({
      kind: "chat",
      text: SAFE_CHAT,
      card,
      cardText: card.answer_th,
      via: "rules",
      banner: [],
      chips: [],
      offer: "none",
      offerIntents: [],
      capNotice: null,
      groupId: staleToken,
    });
    await p1;
    expect(cardAfterUser(chat.messages, THANKS)).not.toContain(LEAK_ID);
  });

  it("turn 3 of a real topic still closes with a bank card", async () => {
    const { model } = chatModel({ pick: "none" });
    const s = new DialogSession("18+", deps(model));
    s.start();
    await s.send("ช่วงนี้กังวลเรื่องแฟน");
    await s.send("แฟนไม่ยอมคุยด้วย");
    const closed = await s.send("แล้วหนูควรพูดยังไงดี");
    expect(closed?.kind).toBe("chat");
    if (closed?.kind === "chat") expect(closed.card).toBeTruthy();
  });
});
