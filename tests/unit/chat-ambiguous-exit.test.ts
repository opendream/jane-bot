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

// SYNTHETIC paraphrases only. Never user logs.
const TH_AMB = "หนูไม่ค่อยอยาก die นะ แค่ถามเรื่อง HIV";
const THANKS = "ขอบคุณค่ะ";
const SAFE_CHAT = "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";
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
      return SAFE_CHAT;
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

async function waitUntil(fn: () => boolean, ms = 400) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
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
  it("AMBIGUOUS then ขอบคุณค่ะ while generating, timeout still renders the soft line (no empty drop)", async () => {
    const { model, calls } = spyModel({ hang: true, delayMs: 40 });
    const chat = newChat("18-24", model, null, { chatFirst: true });
    chat.session = new DialogSession("18-24", chatDeps(model, { chatTimeoutMs: 30 }));
    chat.session.start();
    const h = hooks();
    const p1 = sendToChat(chat, TH_AMB, h);
    await waitUntil(() => calls.started > 0);
    await sendToChat(chat, THANKS, h);
    await p1;
    expect(h.crisisCalls).toBe(0);
    const jane = janeSoft(chat.messages);
    expect(jane.length).toBeGreaterThan(0);
    expect(jane[0]?.softCrisis?.line).toBe(DRAFT_SOFT);
    expect(chat.messages.some((m) => m.from === "jane")).toBe(true);
  });

  it("AMBIGUOUS then ขอบคุณค่ะ while generating, guard fail twice still renders the soft line", async () => {
    const { model, calls } = spyModel({ chat: BAD_CHAT, delayMs: 30 });
    const s = new DialogSession("18-24", chatDeps(model));
    s.start();
    const p1 = s.send(TH_AMB);
    await waitUntil(() => calls.started > 0);
    const r2 = await s.send(THANKS);
    expect(await p1).toBeNull();
    expect(r2).not.toBeNull();
    expect(r2!.kind).not.toBe("crisis");
    expect(softOf(r2!)?.line).toBe(DRAFT_SOFT);
    const msg = chatMsgFromReply(r2!, false, true);
    expect(msg).not.toBeNull();
    expect(msg?.softCrisis?.line).toBe(DRAFT_SOFT);
  });
});

describe("Codex HIGH 2: show-card-now / chip keep the soft line", () => {
  it("AMBIGUOUS then ขอข้อมูลเลย while generating shows a card plus the soft line and button", async () => {
    const { model, calls } = spyModel({ delayMs: 80 });
    const chat = newChat("18-24", model, null, { chatFirst: true });
    const h = hooks();
    const p1 = sendToChat(chat, TH_AMB, h);
    await waitUntil(() => calls.started > 0);
    await sendToChat(chat, SHOW_CARD_NOW, h);
    await p1;
    expect(h.crisisCalls).toBe(0);
    const jane = [...chat.messages].reverse().find((m) => m.from === "jane");
    expect(jane?.cardId).toBeTruthy();
    expect(jane?.softCrisis?.line).toBe(DRAFT_SOFT);
    expect(janeSoft(chat.messages).length).toBeGreaterThan(0);
  });

  it("AMBIGUOUS unanswered then a follow-up chip shows that card plus the soft line", async () => {
    const { model, calls } = spyModel({ delayMs: 80 });
    const s = new DialogSession("18-24", chatDeps(model));
    const welcome = s.start();
    expect(welcome.kind).toBe("card");
    const chip = welcome.kind === "card" ? welcome.chips[0] : undefined;
    expect(chip?.label_th).toBeTruthy();
    const p1 = s.send(TH_AMB);
    await waitUntil(() => calls.started > 0);
    const r2 = await s.send(chip!.label_th);
    expect(await p1).toBeNull();
    expect(r2?.kind === "card" || (r2?.kind === "chat" && r2.card)).toBeTruthy();
    expect(softOf(r2!)?.line).toBe(DRAFT_SOFT);
    expect(chatMsgFromReply(r2!, false, true)?.softCrisis?.line).toBe(DRAFT_SOFT);
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
      out = await runTurn(newDialog("18-24"), "I don't want to live in fear of HIV", d);
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
    if (path === "locked" && (out.reply.kind === "card" || out.reply.kind === "chat")) {
      const id = out.reply.kind === "card" ? out.reply.card.id : out.reply.card?.id;
      expect(id).toBe("ec.timing.b001");
      expect(calls.chat + calls.pick + calls.reword).toBe(0);
    }
  });
});
