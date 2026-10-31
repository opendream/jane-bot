import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_HOLDING_LINE } from "../../src/llm/chatGuard";
import {
  DialogSession,
  HARD_CAP,
  SOFT_CAP,
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import { SHOW_CARD_NOW } from "../../src/core/chat-flow";
import { AMBIGUOUS_CRISIS_LINE_TH } from "../../src/core/chat-crisis";
import { BANK } from "../../src/core/bankData";
import { newChat, sendToChat, type ChatHooks } from "../../src/ui/chat";
import { CHAT_THINKING_PHRASES, thinkingPhraseAt } from "../../src/ui/chat-thinking";
import {
  resetGenerationTokenForTests,
  shouldSkipGeneration,
} from "../../src/llm/generation-token";
import { createGenerationQueue } from "../../src/llm/generation-queue";
import { DEFAULT_CHAT_CHOICE_JSON, defaultChatReply } from "../../src/llm/chat-choice";

const SAFE_JSON = DEFAULT_CHAT_CHOICE_JSON;
const SAFE_CHAT = defaultChatReply("th");
const BAD_CHAT = "กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test";
const A = "ช่วงนี้กังวลเรื่องแฟน";
const B = "แฟนไม่ยอมคุยด้วย";
const C = "แล้วหนูควรพูดยังไงดี";

afterEach(() => {
  resetGenerationTokenForTests();
});

function deps(model: DialogModel | null = null, extra: Partial<TurnDeps> = {}): TurnDeps {
  return { cards: BANK, model, copyStatus: "draft", chatFirst: true, ...extra };
}

function delayedModel(opts: { delayMs?: number; serial?: boolean; replies?: Array<string | null> } = {}) {
  const delayMs = opts.delayMs ?? 80;
  const calls = { chat: 0, pick: 0, started: 0, lastChat: "" };
  const replies = opts.replies ?? [];
  let n = 0;
  const queue = opts.serial ? createGenerationQueue() : null;
  const run = async (
    text: string,
    _history: { role: "user" | "assistant"; content: string }[],
    signal: AbortSignal,
    _lang?: string,
    groupId?: number,
  ) => {
    if (shouldSkipGeneration(groupId, signal)) return null;
    calls.started++;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, delayMs);
      const onAbort = () => { clearTimeout(t); resolve(); };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    if (shouldSkipGeneration(groupId, signal)) return null;
    calls.chat++;
    calls.lastChat = text;
    const next = replies[n++];
    if (next !== undefined) return next;
    return SAFE_JSON;
  };
  const model: DialogModel = {
    ready: () => true,
    pickCard: async () => "none",
    chatReply: queue
      ? (text, history, signal, lang, groupId) => queue.run(groupId, signal, (s) => run(text, history, s, lang, groupId))
      : run,
  };
  return { model, calls };
}

function hooks(): ChatHooks & { crisisCalls: number } {
  const h: ChatHooks & { crisisCalls: number } = {
    crisisCalls: 0,
    rerender: () => {},
    crisis: () => { h.crisisCalls++; },
  };
  return h;
}

async function waitUntil(fn: () => boolean, ms = 400) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("chat-first message grouping", () => {
  it("2–3 quick messages get one reply to the combined unanswered text", async () => {
    const { model, calls } = delayedModel({ delayMs: 60, serial: true });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send(A);
    await waitUntil(() => calls.started > 0);
    const p2 = s.send(B);
    const p3 = s.send(C);
    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
    const r3 = await p3;
    expect(r3?.kind).toBe("chat");
    if (r3?.kind === "chat") {
      expect(r3.text).toBe(SAFE_CHAT);
      expect(r3.text).not.toBe(CHAT_HOLDING_LINE);
    }
    expect(calls.lastChat).toBe(`${A}\n${B}\n${C}`);
    expect(calls.chat).toBe(1);
    expect(s.state.chatFlow.topicTurns).toBe(1);
    expect(s.state.turns).toBe(3);
  });

  it("stale results are discarded and never counted", async () => {
    const { model, calls } = delayedModel({ delayMs: 40 });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const before = { chat: calls.chat, started: calls.started };
    const p1 = s.send(A);
    await waitUntil(() => calls.started > before.started);
    const p2 = s.send(B);
    expect(await p1).toBeNull();
    const r2 = await p2;
    expect(r2?.kind).toBe("chat");
    expect(r2?.groupId).toBeTruthy();
    expect(calls.chat).toBe(1);
    expect(s.state.chatFlow.topicTurns).toBe(1);
  });

  it("turn count and card-by-turn-3 count answered groups, not raw messages", async () => {
    const { model } = delayedModel({ delayMs: 20, serial: true });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const g1 = Promise.all([s.send(A), s.send(B)]);
    await g1;
    expect(s.state.chatFlow.topicTurns).toBe(1);
    await s.send("ยังกังวลอยู่ค่ะ");
    expect(s.state.chatFlow.topicTurns).toBe(2);
    const closed = await s.send("แล้วควรทำไงดี");
    expect(s.state.chatFlow.topicTurns).toBe(0);
    expect(closed?.kind === "chat" && closed.card).toBeTruthy();
  });

  it("session caps still count raw messages", async () => {
    const { model } = delayedModel({ delayMs: 5, serial: true });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send(A);
    const p2 = s.send(B);
    const p3 = s.send(C);
    await p1; await p2; await p3;
    expect(s.state.turns).toBe(3);
    expect(s.state.turns).toBeLessThan(SOFT_CAP);
    expect(HARD_CAP).toBe(30);
  });

  it("crisis in message 2 of a group wins immediately and no generation happens for that turn", async () => {
    const { model, calls } = delayedModel({ delayMs: 80 });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send(A);
    await waitUntil(() => calls.started > 0);
    const before = { chat: calls.chat, started: calls.started };
    const t0 = Date.now();
    const p2 = s.send("อยากตาย");
    const r2 = await p2;
    expect(Date.now() - t0).toBeLessThan(50);
    expect(r2?.kind).toBe("crisis");
    expect(await p1).toBeNull();
    expect(calls.chat).toBe(before.chat);
    expect(s.state.chatFlow.rulesOnly).toBe(true);
  });

  it("AMBIGUOUS in the second of two grouped messages is the card plus the DRAFT soft line, 0 model calls", async () => {
    const { model, calls } = delayedModel({ delayMs: 80 });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send(A);
    await waitUntil(() => calls.started > 0);
    const before = { chat: calls.chat, started: calls.started };
    const p2 = s.send("หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง");
    const r2 = await p2;
    expect(await p1).toBeNull();
    expect(r2?.kind).toBe("card");
    if (r2?.kind === "card") {
      expect(r2.softCrisis?.line).toBe(AMBIGUOUS_CRISIS_LINE_TH);
      expect(r2.softCrisis?.categories).toContain("self_harm");
    }
    expect(calls.chat).toBe(before.chat);
  });

  it("a crisis line hidden in the first of two grouped messages opens the crisis screen with 0 model calls", async () => {
    const { model, calls } = delayedModel({ delayMs: 80 });
    const before = { chat: calls.chat, started: calls.started };
    const grouped = await runTurn(newDialog(), "อยากตาย\nช่วงนี้กังวลเรื่องแฟน", deps(model, {
      groupMessages: ["อยากตาย", A],
    }));
    expect(grouped.reply.kind).toBe("crisis");
    expect(calls.chat).toBe(before.chat);
    expect(calls.started).toBe(before.started);

    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send("อยากตาย");
    const p2 = s.send(A);
    const replies = [await p1, await p2];
    expect(replies.some((r) => r?.kind === "crisis")).toBe(true);
    expect(replies.filter((r) => r != null && r.kind !== "crisis")).toEqual([]);
    expect(calls.chat).toBe(before.chat);
    expect(calls.started).toBe(before.started);
  });

  it("crisis window spans all unanswered messages", async () => {
    const { model, calls } = delayedModel({ delayMs: 80 });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send("หนูอยาก");
    await waitUntil(() => calls.started > 0);
    const before = { chat: calls.chat };
    const p2 = s.send("ตาย");
    const r2 = await p2;
    expect(r2?.kind).toBe("crisis");
    expect(await p1).toBeNull();
    expect(calls.chat).toBe(before.chat);
  });

  it("ขอข้อมูลเลย mid-generation cancels and shows the card", async () => {
    const { model, calls } = delayedModel({ delayMs: 80 });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send(A);
    await waitUntil(() => calls.started > 0);
    const before = { chat: calls.chat };
    const p2 = s.send(SHOW_CARD_NOW);
    const r2 = await p2;
    expect(await p1).toBeNull();
    expect(r2?.kind === "card" || (r2?.kind === "chat" && r2.card)).toBeTruthy();
    expect(calls.chat).toBe(before.chat);
  });

  it("a queued serial generate whose group is stale returns without generating", async () => {
    const { model, calls } = delayedModel({ delayMs: 30, serial: true });
    const s = new DialogSession("18+", deps(model));
    s.start();
    const p1 = s.send(A);
    const p2 = s.send(B);
    const p3 = s.send(C);
    await p1; await p2; await p3;
    expect(calls.chat).toBe(1);
  });

  it("an abandoned timed-out call does not delay the next turn", async () => {
    const queue = createGenerationQueue();
    const calls = { started: 0, aborted: 0 };
    const model: DialogModel = {
      ready: () => true,
      chatReply: (_text, _history, signal, _lang, groupId) =>
        queue.run(groupId, signal, async (s) => {
          calls.started++;
          const waitMs = calls.started === 1 ? 250 : 5;
          try {
            await new Promise<void>((resolve, reject) => {
              const t = setTimeout(resolve, waitMs);
              const onAbort = () => { clearTimeout(t); calls.aborted++; reject(new Error("aborted")); };
              if (s.aborted) return onAbort();
              s.addEventListener("abort", onAbort, { once: true });
            });
          } catch { return null; }
          if (shouldSkipGeneration(groupId, s)) return null;
          return SAFE_JSON;
        }),
    };
    const s = new DialogSession("18+", deps(model, { chatTimeoutMs: 25 }));
    s.start();
    const first = await s.send(A);
    expect(first?.kind).toBe("card");
    expect(calls.aborted).toBeGreaterThan(0);
    const beforeStarted = calls.started;
    const t0 = Date.now();
    const second = s.send(B);
    await waitUntil(() => calls.started > beforeStarted, 200);
    expect(Date.now() - t0).toBeLessThan(80);
    const r2 = await second;
    expect(r2?.kind).toBe("chat");
  });
});

describe("chat-first guard retry (no holding bubble)", () => {
  it("fail-then-pass retries once and shows the reply", async () => {
    const { model, calls } = delayedModel({ delayMs: 0, replies: [BAD_CHAT, SAFE_JSON] });
    const before = { chat: calls.chat };
    const r = await runTurn(newDialog(), A, deps(model));
    expect(calls.chat).toBe(before.chat + 2);
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind === "chat") {
      expect(r.reply.text).toBe(SAFE_CHAT);
      expect(r.reply.text).not.toBe(CHAT_HOLDING_LINE);
      expect(r.reply.holding).toBeUndefined();
      expect(r.reply.card).toBeNull();
    }
  });

  it("fail-fail shows the rules top card and never a holding bubble", async () => {
    const { model, calls } = delayedModel({ delayMs: 0, replies: [BAD_CHAT, BAD_CHAT] });
    const before = { chat: calls.chat };
    const r = await runTurn(newDialog(), A, deps(model));
    expect(calls.chat).toBe(before.chat + 2);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.text).not.toBe(CHAT_HOLDING_LINE);
    }
  });

  it("timeout shows the card at once with no retry", async () => {
    const calls = { chat: 0 };
    const model: DialogModel = {
      ready: () => true,
      chatReply: async (_t, _h, signal) => {
        calls.chat++;
        await new Promise<void>((_resolve, reject) => {
          const onAbort = () => reject(new Error("aborted"));
          if (signal.aborted) return onAbort();
          signal.addEventListener("abort", onAbort, { once: true });
        });
        return null;
      },
    };
    const before = { chat: calls.chat };
    const r = await runTurn(newDialog(), A, deps(model, { chatTimeoutMs: 30 }));
    expect(calls.chat).toBe(before.chat + 1);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") expect(r.reply.text).not.toBe(CHAT_HOLDING_LINE);
  });

  it("model not ready shows the card at once with zero chat calls", async () => {
    const calls = { chat: 0 };
    const model: DialogModel = {
      ready: () => false,
      chatReply: async () => { calls.chat++; return SAFE_JSON; },
    };
    const before = { chat: calls.chat };
    const r = await runTurn(newDialog(), A, deps(model));
    expect(calls.chat).toBe(before.chat);
    expect(r.reply.kind).toBe("card");
  });
});

describe("chat-first thinking indicator", () => {
  it("shows only while the model is generating and is never added to the transcript", async () => {
    const { model, calls } = delayedModel({ delayMs: 50 });
    const chat = newChat("18+", model, null, { chatFirst: true });
    const h = hooks();
    const seen: boolean[] = [];
    h.rerender = () => { seen.push(chat.thinking); };
    const pending = sendToChat(chat, A, h);
    await waitUntil(() => chat.thinking);
    expect(chat.thinking).toBe(true);
    expect(chat.thinkingPhrase).toBe(thinkingPhraseAt("th", 0));
    expect(CHAT_THINKING_PHRASES.status).toBe("reviewed");
    expect(CHAT_THINKING_PHRASES.enStatus).toBe("draft");
    await pending;
    expect(chat.thinking).toBe(false);
    expect(chat.messages.some((m) => m.text === thinkingPhraseAt("th", 0))).toBe(false);
    expect(chat.messages.some((m) => m.text === CHAT_HOLDING_LINE)).toBe(false);
    expect(calls.chat).toBeGreaterThan(0);
  });

  it("instant card and crisis turns never show the thinking indicator", async () => {
    const { model, calls } = delayedModel({ delayMs: 20 });
    const cardChat = newChat("18+", model, null, { chatFirst: true });
    const h1 = hooks();
    let sawThinking = false;
    h1.rerender = () => { if (cardChat.thinking) sawThinking = true; };
    const before = { chat: calls.chat };
    await sendToChat(cardChat, "I want to know about birth control", h1);
    expect(sawThinking).toBe(false);
    expect(calls.chat).toBe(before.chat);
    expect(cardChat.messages.some((m) => m.from === "jane" && m.cardId)).toBe(true);

    const crisisChat = newChat("18+", model, null, { chatFirst: true });
    const h2 = hooks();
    let sawCrisisThinking = false;
    h2.rerender = () => { if (crisisChat.thinking) sawCrisisThinking = true; };
    await sendToChat(crisisChat, "อยากตาย", h2);
    expect(h2.crisisCalls).toBe(1);
    expect(sawCrisisThinking).toBe(false);
    expect(crisisChat.thinking).toBe(false);
  });

  it("AMBIGUOUS extra-check never thinks or calls the model; card plus the DRAFT soft line", async () => {
    const { model, calls } = delayedModel({ delayMs: 80 });
    const chat = newChat("18+", model, null, { chatFirst: true });
    const h = hooks();
    let sawThinking = false;
    h.rerender = () => { if (chat.thinking) sawThinking = true; };
    const before = { chat: calls.chat, started: calls.started };
    await sendToChat(chat, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง", h);
    expect(h.crisisCalls).toBe(0);
    expect(sawThinking).toBe(false);
    expect(chat.thinking).toBe(false);
    expect(calls.chat).toBe(before.chat);
    expect(calls.started).toBe(before.started);
    const jane = [...chat.messages].reverse().find((m) => m.from === "jane" && m.softCrisis);
    expect(jane?.cardId).toBeTruthy();
    expect(jane?.softCrisis?.line).toBe(AMBIGUOUS_CRISIS_LINE_TH);
    expect(jane?.softCrisis?.categories).toContain("self_harm");
    expect(chat.messages.some((m) => m.text === thinkingPhraseAt("th", 0))).toBe(false);
  });

  it("AMBIGUOUS model-not-ready is the card plus the DRAFT soft line without thinking", async () => {
    const model: DialogModel = { ready: () => false };
    const chat = newChat("18+", model, null, { chatFirst: true });
    const h = hooks();
    let sawThinking = false;
    h.rerender = () => { if (chat.thinking) sawThinking = true; };
    await sendToChat(chat, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง", h);
    expect(h.crisisCalls).toBe(0);
    expect(sawThinking).toBe(false);
    expect(chat.thinking).toBe(false);
    const jane = [...chat.messages].reverse().find((m) => m.from === "jane");
    expect(jane?.cardId).toBeTruthy();
    expect(jane?.softCrisis?.line).toBe(AMBIGUOUS_CRISIS_LINE_TH);
    expect(jane?.softCrisis?.categories).toContain("self_harm");
  });

  it("AMBIGUOUS never calls the model even when a guard-fail stub is injected", async () => {
    const { model, calls } = delayedModel({ delayMs: 20, replies: [BAD_CHAT, BAD_CHAT] });
    const chat = newChat("18+", model, null, { chatFirst: true });
    const h = hooks();
    let sawThinking = false;
    h.rerender = () => { if (chat.thinking) sawThinking = true; };
    await sendToChat(chat, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง", h);
    expect(h.crisisCalls).toBe(0);
    expect(sawThinking).toBe(false);
    expect(calls.chat).toBe(0);
    const jane = [...chat.messages].reverse().find((m) => m.from === "jane");
    expect(jane?.cardId).toBeTruthy();
    expect(jane?.text).not.toBe(BAD_CHAT);
    expect(jane?.text).not.toBe(CHAT_HOLDING_LINE);
    expect(jane?.softCrisis?.line).toBe(AMBIGUOUS_CRISIS_LINE_TH);
  });

  it("an older dropped message does not clear the current group's indicator", async () => {
    const { model } = delayedModel({ delayMs: 60 });
    const chat = newChat("18+", model, null, { chatFirst: true });
    const h = hooks();
    const p1 = sendToChat(chat, A, h);
    await waitUntil(() => chat.thinking);
    const p2 = sendToChat(chat, B, h);
    await waitUntil(() => chat.thinking && chat.messages.filter((m) => m.from === "user").length >= 2);
    expect(chat.thinking).toBe(true);
    await p1;
    expect(chat.thinking).toBe(true);
    await p2;
    expect(chat.thinking).toBe(false);
  });
});
