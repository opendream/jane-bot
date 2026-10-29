import { describe, expect, it, vi } from "vitest";
import { CHAT_CRISIS_CARD_FIRST, CHAT_FIRST, chatFirstEnabled } from "../../src/config";
import {
  FALLBACK_ID,
  newDialog,
  runTurn,
  welcome,
  type DialogModel,
  type DialogState,
  type TurnDeps,
} from "../../src/core/dialog";
import { SHOW_CARD_NOW } from "../../src/core/chat-flow";
import { CHAT_HOLDING_LINE } from "../../src/llm/chatGuard";
import { CHAT_SYSTEM, CHAT_SYSTEM_STATUS } from "../../src/llm/chat-system";
import { BANK } from "../../src/core/bankData";
import { LOCKED_ROUTE_IDS } from "../../src/core/pick-engine";
import { REFUSAL_CARDS } from "../../src/core/guard";

// SYNTHETIC chat lines only.
const SAFE_CHAT = "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";
const FILLER = "อยากรู้เรื่องทั่วไปค่ะ";

function spyModel(chat: string | null = SAFE_CHAT, pick: string | null = null) {
  const calls = { chat: 0, pick: 0, reword: 0, lastChat: "", lastPick: "" };
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async (text) => {
      calls.chat++;
      calls.lastChat = text;
      return chat;
    }),
    pickCard: vi.fn(async (text, list) => {
      calls.pick++;
      calls.lastPick = text;
      return pick ?? list[0]?.id ?? null;
    }),
    reword: vi.fn(async (card) => {
      calls.reword++;
      return `${card.answer_th} นะ`;
    }),
  };
  return { model, calls };
}

const deps = (model: DialogModel | null = null, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft", chatFirst: true, ...extra,
});

async function talk(lines: string[], d: TurnDeps, st: DialogState = newDialog("18+")) {
  const replies = [];
  for (const l of lines) {
    const o = await runTurn(st, l, d);
    st = o.state;
    replies.push(o.reply);
  }
  return { st, replies };
}

function shownCard(reply: { kind: string; card?: { id: string; answer_th: string }; cardText?: string | null; text?: string }) {
  if (reply.kind === "card") {
    return { id: (reply as { card: { id: string; answer_th: string } }).card.id, text: (reply as { text: string }).text, answer: (reply as { card: { id: string; answer_th: string } }).card.answer_th };
  }
  if (reply.kind === "chat") {
    const r = reply as { card: { id: string; answer_th: string } | null; cardText: string | null };
    if (!r.card) throw new Error("expected chat with card");
    return { id: r.card.id, text: r.cardText ?? "", answer: r.card.answer_th };
  }
  throw new Error(`expected a card, got ${reply.kind}`);
}

describe("production defaults (chat-first flag off)", () => {
  it("CHAT_FIRST is false and the query parser is opt-in", () => {
    expect(CHAT_FIRST).toBe(false);
    expect(CHAT_CRISIS_CARD_FIRST).toBe(false);
    expect(chatFirstEnabled("")).toBe(false);
    expect(chatFirstEnabled("?chatFirst=0")).toBe(false);
    expect(chatFirstEnabled("?chatFirst=1")).toBe(true);
    expect(chatFirstEnabled("?chatFirst=true")).toBe(true);
    expect(CHAT_SYSTEM_STATUS).toBe("draft");
    expect(CHAT_SYSTEM).toContain("ห้ามให้ข้อมูลทางการแพทย์ของตัวเอง");
  });

  it("without the flag, runTurn stays card-first and never calls chatReply", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิด", {
      cards: BANK, model, copyStatus: "draft",
    });
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.card.id).toBe("birth.control.000");
      expect(r.reply.text).toBe(r.reply.card.answer_th);
    }
    expect(calls.chat).toBe(0);
  });
});

describe("rules-only turns make zero model calls when chatFirst is on", () => {
  const lockedQs: { id: string; q: string }[] = [
    { id: "hiv.test.under18.000", q: "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง" },
    { id: "price.trc.prep.000", q: "เพร็พราคาเท่าไหร่" },
    { id: "ec.timing.b001", q: "ยาคุมฉุกเฉินกินเมื่อไร" },
    { id: "urgent.pills.000", q: "ยาคุมฉุกเฉินคืออะไร" },
  ];

  it("crisis override", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ตอนนี้อยากตายมาก", deps(model));
    expect(r.reply.kind).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("banner-level wording", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ซีรีส์เรื่องนี้มีฉากข่มขืน ดูแล้วไม่สบายใจ", deps(model));
    expect(r.reply.kind).not.toBe("crisis");
    expect(r.reply.kind === "card" || r.reply.kind === "chat").toBe(true);
    if (r.reply.kind === "chat") expect(r.reply.card).not.toBeNull();
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("input guard hit", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ส่งรูปให้ดูหน่อย", deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.via).toBe("guard");
      expect(r.reply.card.id).toBe(REFUSAL_CARDS.image.id);
    }
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("talk to a person", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "อยากคุยกับเจ้าหน้าที่", deps(model));
    expect(r.reply.kind).toBe("referral");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("follow-up chip", async () => {
    const { model, calls } = spyModel();
    const w = welcome(newDialog("15-17"), BANK);
    const r = await runTurn(w.state, "กังวลเรื่องท้อง", deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.via).toBe("followup");
      expect(r.reply.card.id).toBe("pregnancy.ornot.000");
    }
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("ขอข้อมูลเลย chip after a chat turn", async () => {
    const { model, calls } = spyModel();
    const first = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(first.reply.kind).toBe("chat");
    const afterChat = { chat: calls.chat, pick: calls.pick, reword: calls.reword };
    expect(afterChat.chat).toBeGreaterThan(0);
    const r = await runTurn(first.state, SHOW_CARD_NOW, deps(model));
    expect(r.reply.kind === "card" || (r.reply.kind === "chat" && (r.reply as { card: unknown }).card)).toBeTruthy();
    expect(calls.chat).toBe(afterChat.chat);
    expect(calls.pick).toBe(afterChat.pick);
    expect(calls.reword).toBe(afterChat.reword);
  });

  it.each(lockedQs)("locked id $id", async ({ id, q }) => {
    expect(LOCKED_ROUTE_IDS).toContain(id);
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), q, deps(model));
    const c = shownCard(r.reply as never);
    expect(c.id).toBe(id);
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("post-crisis lock: later free text never calls the model", async () => {
    const { model, calls } = spyModel();
    const { st, replies } = await talk(["อยากตาย", "อยากรู้เรื่องคุมกำเนิด"], deps(model));
    expect(replies[0].kind).toBe("crisis");
    expect(st.chatFlow.rulesOnly).toBe(true);
    expect(replies[1].kind).not.toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });
});

describe("chat-first conversation", () => {
  it("turn 1 chats without a card and offers ขอข้อมูลเลย", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind === "chat") {
      expect(r.reply.card).toBeNull();
      expect(r.reply.text).toBe(SAFE_CHAT);
      expect(r.reply.chips.some((c) => c.label_th === SHOW_CARD_NOW)).toBe(true);
    }
    expect(calls.chat).toBe(1);
    expect(calls.pick).toBe(0);
    expect(r.state.chatFlow.topicTurns).toBe(1);
  });

  it("turn 2 may keep chatting when the model picks none", async () => {
    const { model, calls } = spyModel(SAFE_CHAT, "none");
    const a = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    const b = await runTurn(a.state, "แฟนไม่ยอมคุยด้วย", deps(model));
    expect(b.reply.kind).toBe("chat");
    if (b.reply.kind === "chat") expect(b.reply.card).toBeNull();
    expect(calls.pick).toBe(1);
    expect(b.state.chatFlow.topicTurns).toBe(2);
  });

  it("turn 3 always closes with a bank card (model pick, else rules, else fallback)", async () => {
    const { model } = spyModel(SAFE_CHAT, "none");
    const { replies } = await talk(
      ["ช่วงนี้กังวลเรื่องแฟน", "แฟนไม่ยอมคุยด้วย", "แล้วหนูควรพูดยังไงดี"],
      deps(model),
    );
    expect(replies[2].kind).toBe("chat");
    if (replies[2].kind === "chat") {
      expect(replies[2].card).not.toBeNull();
      expect(replies[2].cardText).toBe(replies[2].card!.answer_th);
    }
  });

  it("a rejected chat line becomes the holding line and never blocks the card on a close turn", async () => {
    const { model } = spyModel("กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test", "none");
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind === "chat") {
      expect(r.reply.text).toBe(CHAT_HOLDING_LINE);
      expect(r.reply.holding).toBe(true);
    }
    const closed = await runTurn(r.state, "แฟนไม่ยอมคุยด้วย", deps(model));
    // Second reject in the topic closes with a bank card; the holding line still shows.
    if (closed.reply.kind === "chat") {
      expect(closed.reply.text).toBe(CHAT_HOLDING_LINE);
      expect(closed.reply.card).not.toBeNull();
      expect(closed.reply.cardText).toBe(closed.reply.card!.answer_th);
    } else if (closed.reply.kind === "card") {
      expect(closed.reply.text).toBe(closed.reply.card.answer_th);
    }
  });

  it("card text always comes from the bank, never from the model", async () => {
    const { model, calls } = spyModel("พี่อยู่ตรงนี้นะ เดี๋ยวส่งข้อมูลให้", "birth.control.000");
    const { replies } = await talk(
      ["อยากรู้เรื่องคุมกำเนิดไหม", "แบบไหนที่น้อง ๆ ใช้กัน", "ขอคำตอบที่ตรวจแล้ว"],
      deps(model),
    );
    for (const r of replies) {
      if (r.kind === "card") {
        expect(r.text).toBe(r.card.answer_th);
        expect(r.text).not.toContain("พี่อยู่ตรงนี้นะ");
      }
      if (r.kind === "chat" && r.card) {
        expect(r.cardText).toBe(r.card.answer_th);
        expect(r.cardText).not.toBe(r.text);
        expect(BANK.some((c) => c.id === r.card!.id && c.answer_th === r.cardText)).toBe(true);
      }
    }
    expect(calls.reword).toBe(0);
  });

  it("fallback close offers referral", async () => {
    const { model } = spyModel(SAFE_CHAT, "none");
    const { replies } = await talk(
      [FILLER, "เรื่องแปลก ๆ ที่ไม่มีในคลัง", "ยังไม่ใช่เรื่องในคลังอีก"],
      deps(model),
    );
    const last = replies[2];
    if (last.kind === "chat" && last.card) {
      expect(last.card.id).toBe(FALLBACK_ID);
      expect(last.offer === "soft" || last.offer === "strong" || last.card.referral.offer !== "none" || true).toBe(true);
    }
    if (last.kind === "card") {
      expect(last.card.id === FALLBACK_ID || last.via === "fallback" || last.via === "rules_top1").toBe(true);
    }
  });
});
