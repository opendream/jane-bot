import { describe, expect, it, vi } from "vitest";
import { CHAT_FIRST, CHAT_HISTORY_TURNS, chatFirstEnabled } from "../../src/config";
import { newChat } from "../../src/ui/chat";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { planTurn, newChatFlow, applyChatTurn } from "../../src/core/chat-flow";
import { BANK } from "../../src/core/bankData";
import { parseChatChoice, renderChatChoice } from "../../src/llm/chat-choice";
import { acceptChatReply, chatGuardFailures } from "../../src/llm/chatGuard";
import { CHAT_OPENERS_TH, CHAT_FOLLOWUPS_TH } from "../../src/llm/chat-voice";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";
import { CHAT_SYSTEM } from "../../src/llm/chat-system";
import { detectCrisis } from "../../src/core/crisis";

const SAFE = STUB_CHAT_REPLY_TH;

function spyModel(reply: string = SAFE) {
  const histories: { role: "user" | "assistant"; content: string }[][] = [];
  const texts: string[] = [];
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async (text, history) => {
      texts.push(text);
      histories.push(history.map((h) => ({ ...h })));
      return reply;
    }),
    pickCard: vi.fn(async (_t, list) => list[0]?.id ?? null),
  };
  return { model, histories, texts };
}

const deps = (model: DialogModel | null, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft", chatFirst: true, ...extra,
});

describe("card-first is the production default", () => {
  it("CHAT_FIRST is off; ?chatFirst=1 is the experimental opt-in", () => {
    expect(CHAT_FIRST).toBe(false);
    expect(chatFirstEnabled("")).toBe(false);
    expect(chatFirstEnabled("?model=off")).toBe(false);
    expect(chatFirstEnabled("?chatFirst=1")).toBe(true);
    expect(chatFirstEnabled("?chatFirst=true")).toBe(true);
    expect(chatFirstEnabled("?chatFirst=on")).toBe(true);
    expect(chatFirstEnabled("?chatFirst=0")).toBe(false);
    expect(chatFirstEnabled("?chatFirst=false")).toBe(false);
    expect(chatFirstEnabled("?chatFirst=off")).toBe(false);
    expect(CHAT_HISTORY_TURNS).toBeGreaterThanOrEqual(3);
  });

  it("newChat without a query flag is card-first", () => {
    const chat = newChat("18-24", null);
    expect(chat.chatFirst).toBe(false);
  });

  it("newChat with ?chatFirst=1 enables chat-first", () => {
    const chat = newChat("18-24", null, null, { search: "?chatFirst=1" });
    expect(chat.chatFirst).toBe(true);
  });

  it("newChat with ?chatFirst=0 still forces card-first", () => {
    const chat = newChat("18-24", null, null, { search: "?chatFirst=0" });
    expect(chat.chatFirst).toBe(false);
  });

  it("the Thai persona is เจน who calls herself เรา and the user เธอ", () => {
    expect(CHAT_SYSTEM).toContain("เจน");
    expect(CHAT_SYSTEM).toContain("เรา");
    expect(CHAT_SYSTEM).toContain("เธอ");
    expect(CHAT_SYSTEM).not.toMatch(/พี่เจน/);
  });

  it("default URL is card-first and a v40 JSON choice maps to an approved card", async () => {
    expect(chatFirstEnabled("")).toBe(false);
    const birth = BANK.find((c) => c.id === "birth.control.000");
    expect(birth).toBeTruthy();
    const json = '{"o":0,"c":1,"q":0}';
    const parsed = parseChatChoice(json, {
      openerCount: CHAT_OPENERS_TH.length,
      followUpCount: CHAT_FOLLOWUPS_TH.length,
      hasCard: true,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const text = renderChatChoice(parsed.choice, "th", birth!.answer_th);
    expect(text).toContain(birth!.answer_th);

    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async () => json),
      pickCard: vi.fn(async () => json),
    };
    const r = await runTurn(newDialog("18-24"), "อยากรู้เรื่องคุมกำเนิด", {
      cards: BANK, model, copyStatus: "reviewed",
    });
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.card.id).toBe("birth.control.000");
      expect(BANK.some((c) => c.id === r.reply.card.id)).toBe(true);
      expect(r.reply.text).toBe(r.reply.card.answer_th);
    }
    expect(model.chatReply).not.toHaveBeenCalled();
  });

  it("v40 JSON {o,c,q} is accepted by the card-choice path and rejected by chatGuard as prose", () => {
    const canonical = '{"o":0,"c":0,"q":0}';
    const withCard = '{"o":0,"c":1,"q":0}';
    const observed = '{"o":0,"c":"general","q":0}';
    const bounds = {
      openerCount: CHAT_OPENERS_TH.length,
      followUpCount: CHAT_FOLLOWUPS_TH.length,
      hasCard: true,
    };
    expect(parseChatChoice(canonical, bounds)).toEqual({ ok: true, choice: { o: 0, c: 0, q: 0 } });
    expect(parseChatChoice(withCard, bounds)).toEqual({ ok: true, choice: { o: 0, c: 1, q: 0 } });
    const condom = BANK.find((c) => c.id === "condom.000")!;
    expect(renderChatChoice({ o: 0, c: 1, q: 0 }, "th", condom.answer_th)).toContain(condom.answer_th);

    expect(acceptChatReply(canonical).ok).toBe(false);
    expect(acceptChatReply(withCard).ok).toBe(false);
    expect(acceptChatReply(observed).ok).toBe(false);
    expect(chatGuardFailures(canonical)).toContain("think");
    expect(chatGuardFailures(withCard)).toContain("think");
    expect(chatGuardFailures(observed)).toContain("think");
  });
});

describe("planTurn never force-closes on a turn cap", () => {
  it("turns 1–5 keep chatting with no pick and no close", () => {
    let flow = newChatFlow();
    for (const n of [1, 2, 3, 4, 5]) {
      const plan = planTurn({
        flow, crisis: "none", guard: false, human: false, chip: false, showNow: false,
        locked: false, rulesConfident: n === 1, directQuestion: n === 1,
      });
      expect(plan, `turn ${n}`).toMatchObject({
        reason: "chat", callChat: true, callPick: false, close: "never", topicTurn: n,
      });
      flow = applyChatTurn(flow, `line-${n}`, SAFE, false);
    }
  });
});

describe("model-generated replies with history", () => {
  const FLOW = [
    "ปวดประจำเดือน",
    "แล้วถ้ามาช้ากว่าปกตินิดหน่อยละ",
    "มีอะไรกับแฟนด้วย แล้วลืมกินยาคุม กลัวท้อง",
  ] as const;

  it("the fixed three-turn flow makes three model replies, each carrying earlier turns, with no card", async () => {
    const replies = [
      "เราฟังอยู่นะคะ เธอเล่าเรื่องประจำเดือนต่อได้เลยค่ะ",
      "เราเข้าใจค่ะ เธอเล่าต่อได้เลยนะคะ",
      "เราอยู่ตรงนี้ค่ะ เธอเล่าเรื่องยาคุมต่อได้เลยนะคะ",
    ];
    const histories: { role: "user" | "assistant"; content: string }[][] = [];
    let n = 0;
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async (_text, history) => {
        histories.push(history.map((h) => ({ ...h })));
        return replies[n++] ?? SAFE;
      }),
    };
    let st = newDialog("18-24");
    const kinds: string[] = [];
    const cards: Array<string | null> = [];
    const texts: string[] = [];
    for (const line of FLOW) {
      const out = await runTurn(st, line, deps(model));
      st = out.state;
      kinds.push(out.reply.kind);
      if (out.reply.kind === "chat") {
        cards.push(out.reply.card ? out.reply.card.id : null);
        texts.push(out.reply.text);
      } else {
        cards.push("not-chat");
        texts.push("");
      }
    }
    expect(kinds).toEqual(["chat", "chat", "chat"]);
    expect(cards).toEqual([null, null, null]);
    expect(texts).toEqual(replies);
    expect(model.chatReply).toHaveBeenCalledTimes(3);

    expect(histories[0]).toEqual([]);
    expect(histories[1]).toEqual([
      { role: "user", content: FLOW[0] },
      { role: "assistant", content: replies[0] },
    ]);
    expect(histories[2]).toEqual([
      { role: "user", content: FLOW[0] },
      { role: "assistant", content: replies[0] },
      { role: "user", content: FLOW[1] },
      { role: "assistant", content: replies[1] },
    ]);

    for (const t of texts) {
      expect(CHAT_OPENERS_TH.includes(t)).toBe(false);
      expect(CHAT_FOLLOWUPS_TH.includes(t)).toBe(false);
    }
  });

  it("turns 3, 4 and 5 stay on chat when the stub passes the guard", async () => {
    const { model } = spyModel();
    let st = newDialog();
    for (const line of ["ช่วงนี้กังวลเรื่องแฟน", "แฟนไม่ยอมคุยด้วย", "แล้วหนูควรพูดยังไงดี", "หนูยังคิดไม่ออก", "เล่าต่ออีกได้ไหม"]) {
      const out = await runTurn(st, line, deps(model));
      st = out.state;
      expect(out.reply.kind).toBe("chat");
      if (out.reply.kind === "chat") expect(out.reply.card).toBeNull();
    }
    expect(model.chatReply).toHaveBeenCalledTimes(5);
  });

  it("visible Jane text is the model string, not a chat-voice list pick", async () => {
    const { model } = spyModel(SAFE);
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.text).toBe(SAFE);
    expect(r.reply.text).not.toBe(CHAT_OPENERS_TH[0]);
    expect(CHAT_OPENERS_TH.some((o) => o && r.reply.kind === "chat" && r.reply.text === o)).toBe(false);
  });
});

describe("reviewed cards only as fallback", () => {
  it("guard-failing generation retries once then shows a bank card", async () => {
    const calls = { n: 0 };
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async () => {
        calls.n++;
        return "กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test";
      }),
    };
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(calls.n).toBe(2);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") expect(r.reply.text).toBe(r.reply.card.answer_th);
  });

  it("generation timeout shows a bank card", async () => {
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async (_t, _h, signal) => {
        await new Promise<void>((_resolve, reject) => {
          const onAbort = () => reject(new Error("aborted"));
          if (signal.aborted) return onAbort();
          signal.addEventListener("abort", onAbort, { once: true });
        });
        return null;
      }),
    };
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model, { chatTimeoutMs: 20 }));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") expect(r.reply.text).toBe(r.reply.card.answer_th);
  });

  it("model not ready shows a bank card and never calls chatReply", async () => {
    const model: DialogModel = {
      ready: () => false,
      chatReply: vi.fn(async () => SAFE),
    };
    const r = await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิด", deps(model));
    expect(r.reply.kind).toBe("card");
    expect(model.chatReply).not.toHaveBeenCalled();
  });
});

describe("crisis bypass never calls the model", () => {
  it("อยากตาย is the crisis screen in both modes with zero model calls", async () => {
    const line = "อยากตาย";
    expect(detectCrisis(line).crisis).toBe(true);
    for (const chatFirst of [false, true]) {
      const { model } = spyModel();
      const r = await runTurn(newDialog(), line, deps(model, { chatFirst }));
      expect(r.reply.kind, `chatFirst=${chatFirst}`).toBe("crisis");
      expect(model.chatReply).not.toHaveBeenCalled();
      expect(model.pickCard).not.toHaveBeenCalled();
    }
  });
});
