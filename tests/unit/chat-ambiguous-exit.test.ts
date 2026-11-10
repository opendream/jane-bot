import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DialogSession,
  HARD_CAP,
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
  type TurnReply,
} from "../../src/core/dialog";
import { SHOW_CARD_NOW } from "../../src/core/chat-flow";
import { AMBIGUOUS_CRISIS_LINE_TH } from "../../src/core/chat-crisis";
import { ACK_LINE_TH, ACK_LINE_TH_STATUS } from "../../src/core/chat-group";
import { BANK } from "../../src/core/bankData";
import { REFUSAL_CARDS } from "../../src/core/guard";
import { newChat, sendToChat, chatMsgFromReply, type ChatHooks } from "../../src/ui/chat";
import {
  resetGenerationTokenForTests,
} from "../../src/llm/generation-token";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

// SYNTHETIC paraphrases only. Never user logs.
const TH_AMB = "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง";
const THANKS = "ขอบคุณค่ะ";
const SAFE_JSON = STUB_CHAT_REPLY_TH;
const BAD_CHAT = "กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test";
const DRAFT_SOFT = AMBIGUOUS_CRISIS_LINE_TH;

afterEach(() => {
  resetGenerationTokenForTests();
});

function spyModel(opts?: { chat?: string | null; ready?: boolean; hang?: boolean; delayMs?: number }) {
  const calls = { chat: 0, pick: 0, reword: 0, started: 0, lastChat: "" };
  const model: DialogModel = {
    ready: () => opts?.ready !== false,
    chatReply: vi.fn(async (text, _h, signal) => {
      calls.started++;
      if (opts?.delayMs) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, opts.delayMs);
          const onAbort = () => { clearTimeout(t); resolve(); };
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort, { once: true });
        });
        if (signal?.aborted) return null;
      }
      calls.chat++;
      calls.lastChat = text;
      if (opts?.hang) {
        await new Promise<void>((_, reject) => {
          const onAbort = () => reject(new Error("aborted"));
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      }
      if (opts && "chat" in opts) return opts.chat ?? null;
      return SAFE_JSON;
    }),
    pickCard: vi.fn(async (_t, list) => {
      calls.pick++;
      return list[0]?.id ?? null;
    }),
    reword: vi.fn(async (card) => {
      calls.reword++;
      return card.answer_th;
    }),
  };
  return { model, calls };
}

const chatDeps = (model: DialogModel | null = null, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft", chatFirst: true, ...extra,
});

function hooks(): ChatHooks & { crisisCalls: number } {
  const h: ChatHooks & { crisisCalls: number } = {
    crisisCalls: 0,
    rerender: () => {},
    crisis: () => { h.crisisCalls++; },
  };
  return h;
}

function softOf(reply: TurnReply) {
  return "softCrisis" in reply ? reply.softCrisis : undefined;
}

function janeSoft(messages: { from: string; softCrisis?: { line: string } }[]) {
  return messages.filter((m) => m.from === "jane" && m.softCrisis);
}

function assertSoftRenders(reply: TurnReply, messages?: { from: string; text?: string; cardId?: string; softCrisis?: { line: string } }[]) {
  expect(reply.kind, `CLEAR crisis is the screen, not the soft line (${reply.kind})`).not.toBe("crisis");
  expect(softOf(reply)?.line).toBe(DRAFT_SOFT);
  expect(softOf(reply)?.categories.length).toBeGreaterThan(0);
  const msg = chatMsgFromReply(reply, false, true);
  expect(msg, "renderer must not drop an AMBIGUOUS reply").not.toBeNull();
  expect(msg?.softCrisis?.line).toBe(DRAFT_SOFT);
  if (messages) {
    expect(janeSoft(messages).length, "transcript must show the soft line").toBeGreaterThan(0);
    expect(janeSoft(messages)[0]?.softCrisis?.line).toBe(DRAFT_SOFT);
  }
}

describe("DRAFT local ack copy", () => {
  it("marks the Thai acknowledgement as DRAFT for Keng review", () => {
    expect(ACK_LINE_TH_STATUS).toBe("draft");
    expect(ACK_LINE_TH).toMatch(/\S/);
    expect(ACK_LINE_TH.includes("\n")).toBe(false);
  });
});

describe("renderer keeps an AMBIGUOUS chat reply with no text and no card", () => {
  it("chatMsgFromReply shows the soft line when text and card are empty", () => {
    const msg = chatMsgFromReply({
      kind: "chat",
      text: "",
      card: null,
      cardText: null,
      via: "rules",
      banner: [],
      chips: [],
      offer: "none",
      offerIntents: [],
      capNotice: null,
      softCrisis: { line: DRAFT_SOFT, categories: ["self_harm"] },
    }, false, true);
    expect(msg).not.toBeNull();
    expect(msg?.softCrisis?.line).toBe(DRAFT_SOFT);
    expect(msg?.text).toBe("");
  });
});

describe("Codex HIGH 1: grouped thanks must not blank an AMBIGUOUS turn", () => {
  it("AMBIGUOUS then ขอบคุณค่ะ keeps the first soft line (no empty drop, 0 model calls)", async () => {
    const { model, calls } = spyModel();
    const chat = newChat("18-24", model, null, { chatFirst: true });
    chat.session = new DialogSession("18-24", chatDeps(model));
    chat.session.start();
    const h = hooks();
    await sendToChat(chat, TH_AMB, h);
    expect(calls.chat + calls.started).toBe(0);
    expect(h.crisisCalls).toBe(0);
    const jane = janeSoft(chat.messages);
    expect(jane.length).toBeGreaterThan(0);
    expect(jane[0]?.softCrisis?.line).toBe(DRAFT_SOFT);
    await sendToChat(chat, THANKS, h);
    expect(janeSoft(chat.messages).length).toBeGreaterThan(0);
    expect(chat.messages.some((m) => m.from === "jane")).toBe(true);
  });

  it("AMBIGUOUS grouped with ขอบคุณค่ะ still renders the soft line and never calls the model", async () => {
    const { model, calls } = spyModel({ chat: BAD_CHAT });
    const r = await runTurn(newDialog("18-24"), THANKS, {
      ...chatDeps(model),
      groupMessages: [TH_AMB, THANKS],
    });
    expect(calls.chat).toBe(0);
    expect(r.reply.kind).not.toBe("crisis");
    expect(softOf(r.reply)?.line).toBe(DRAFT_SOFT);
    const msg = chatMsgFromReply(r.reply, false, true);
    expect(msg).not.toBeNull();
    expect(msg?.softCrisis?.line).toBe(DRAFT_SOFT);
  });
});

describe("Codex HIGH 2: show-card-now / chip keep the soft line", () => {
  it("AMBIGUOUS immediately shows a card plus the soft line and button, 0 model calls", async () => {
    const { model, calls } = spyModel();
    const chat = newChat("18-24", model, null, { chatFirst: true });
    const h = hooks();
    await sendToChat(chat, TH_AMB, h);
    expect(h.crisisCalls).toBe(0);
    expect(calls.chat).toBe(0);
    const jane = [...chat.messages].reverse().find((m) => m.from === "jane");
    expect(jane?.cardId).toBeTruthy();
    expect(jane?.softCrisis?.line).toBe(DRAFT_SOFT);
    expect(janeSoft(chat.messages).length).toBeGreaterThan(0);
  });

  it("AMBIGUOUS grouped with ขอข้อมูลเลย shows a card plus the soft line", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog("18-24"), SHOW_CARD_NOW, {
      ...chatDeps(model),
      unansweredLines: [TH_AMB],
      groupMessages: [TH_AMB, SHOW_CARD_NOW],
    });
    expect(calls.chat).toBe(0);
    expect(r.reply.kind === "card" || (r.reply.kind === "chat" && r.reply.card)).toBeTruthy();
    expect(softOf(r.reply)?.line).toBe(DRAFT_SOFT);
    expect(chatMsgFromReply(r.reply, false, true)?.softCrisis?.line).toBe(DRAFT_SOFT);
  });
});

describe("every AMBIGUOUS return path carries a renderable soft line", () => {
  it.each([
    "chat-success",
    "timeout",
    "guard-fail-retry",
    "not-ready",
    "english-no-model",
    "refusal",
    "staff",
    "locked",
    "banner",
    "readonly",
    "card-first",
    "post-crisis",
    "ack-only-group",
    "show-now-group",
    "thanks-fallback-group",
  ] as const)("%s", async (path) => {
    const { model, calls } = spyModel(
      path === "timeout" || path === "thanks-fallback-group" ? { hang: true }
        : path === "guard-fail-retry" ? { chat: BAD_CHAT }
          : path === "not-ready" ? { ready: false }
            : {},
    );
    const d = chatDeps(model, path === "timeout" || path === "thanks-fallback-group" ? { chatTimeoutMs: 20 } : {});
    let out: { reply: TurnReply };
    if (path === "chat-success") {
      out = await runTurn(newDialog("18-24"), TH_AMB, d);
    } else if (path === "timeout") {
      out = await runTurn(newDialog("18-24"), TH_AMB, d);
    } else if (path === "guard-fail-retry") {
      out = await runTurn(newDialog("18-24"), TH_AMB, d);
    } else if (path === "not-ready") {
      out = await runTurn(newDialog("18-24"), TH_AMB, d);
    } else if (path === "english-no-model") {
      out = await runTurn(newDialog("18-24"), "I feel so hopeless about everything", d);
    } else if (path === "refusal") {
      out = await runTurn(newDialog("18-24"), `${TH_AMB} ขอรูปหน่อย`, d);
    } else if (path === "staff") {
      out = await runTurn(newDialog("18-24"), `${TH_AMB} อยากคุยกับเจ้าหน้าที่`, d);
    } else if (path === "locked") {
      out = await runTurn(newDialog("18-24"), TH_AMB, {
        ...d,
        groupMessages: ["ยาคุมฉุกเฉินกินเมื่อไร", TH_AMB],
      });
    } else if (path === "banner") {
      out = await runTurn(newDialog("18-24"), "ซีรีส์เรื่องนี้มีฉากข่มขืน ดูแล้วไม่สบายใจ", {
        ...d,
        groupMessages: ["ซีรีส์เรื่องนี้มีฉากข่มขืน ดูแล้วไม่สบายใจ", TH_AMB],
      });
    } else if (path === "readonly") {
      const st = newDialog("18-24");
      st.turns = HARD_CAP;
      out = await runTurn(st, TH_AMB, d);
    } else if (path === "card-first") {
      out = await runTurn(newDialog("18-24"), TH_AMB, { cards: BANK, model, copyStatus: "draft" });
    } else if (path === "post-crisis") {
      const first = await runTurn(newDialog("18-24"), "อยากตาย", d);
      expect(first.reply.kind).toBe("crisis");
      out = await runTurn(first.state, TH_AMB, d);
    } else if (path === "ack-only-group") {
      out = await runTurn(newDialog("18-24"), THANKS, {
        ...d,
        groupMessages: [TH_AMB, THANKS],
      });
    } else if (path === "show-now-group") {
      out = await runTurn(newDialog("18-24"), SHOW_CARD_NOW, {
        ...d,
        unansweredLines: [TH_AMB],
        groupMessages: [TH_AMB, SHOW_CARD_NOW],
      });
    } else {
      out = await runTurn(newDialog("18-24"), THANKS, {
        ...d,
        groupMessages: [TH_AMB, THANKS],
      });
    }
    if (path === "post-crisis") {
      // After CLEAR, later AMBIGUOUS still talks with the soft line (not inherited CLEAR).
    }
    assertSoftRenders(out.reply);
    if (path === "refusal" && out.reply.kind === "card") {
      expect(out.reply.card.id).toBe(REFUSAL_CARDS.image.id);
    }
    if (path === "staff") expect(out.reply.kind).toBe("referral");
    if (path === "readonly") expect(out.reply.kind).toBe("readonly");
    if (path === "english-no-model") expect(calls.chat + calls.pick + calls.reword).toBe(0);
    if (path === "locked") {
      expect(out.reply.kind).toBe("card");
      expect(calls.chat + calls.pick + calls.reword).toBe(0);
    }
  });
});
