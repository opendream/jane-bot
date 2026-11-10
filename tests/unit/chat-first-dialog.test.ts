import { describe, expect, it, vi } from "vitest";
import { CHAT_CRISIS_CARD_FIRST, CHAT_FIRST, CHAT_FIRST_TIMEOUT_MS, CHAT_TIMEOUT_MS, ENGLISH_MODEL_CHAT, chatFirstEnabled } from "../../src/config";
import { PICK_TIMEOUT_MS, REWORD_TIMEOUT_MS } from "../../src/core/dialog";
import { detectCrisis } from "../../src/core/crisis";
import {
  FALLBACK_ID,
  newDialog,
  runTurn,
  welcome,
  type DialogModel,
  type DialogState,
  type TurnDeps,
} from "../../src/core/dialog";
import { SHOW_CARD_NOW, SHOW_CARD_NOW_EN } from "../../src/core/chat-flow";
import { detectChatLang, modelChatScript } from "../../src/llm/chat-lang";
import {
  CHAT_LANG_LINE_EN,
  CHAT_LANG_LINE_TH,
  CHAT_MAX_TOKENS,
  CHAT_SYSTEM,
  CHAT_SYSTEM_EN,
  CHAT_SYSTEM_EN_STATUS,
  CHAT_SYSTEM_STATUS,
  chatSystemFor,
} from "../../src/llm/chat-system";
import { BANK } from "../../src/core/bankData";
import { CARD_THAI_NOTE_EN } from "../../src/core/card-lang";
import { LOCKED_ROUTE_IDS } from "../../src/core/pick-engine";
import { REFUSAL_CARDS } from "../../src/core/guard";
import { STUB_CHAT_REPLY_EN, STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

const DROPPED_HOLDING_LINE = "พี่ฟังอยู่นะ ขอส่งข้อมูลที่ตรวจแล้วให้ก่อน";
const DROPPED_HOLDING_LINE_EN = "I hear you. Let me share the checked information first.";

// SYNTHETIC chat lines only. Model stubs return free text that passes chatGuard.
const SAFE_CHAT = STUB_CHAT_REPLY_TH;
const SAFE_CHAT_EN = STUB_CHAT_REPLY_EN;
const SAFE_JSON = STUB_CHAT_REPLY_TH;
const FILLER = "อยากรู้เรื่องทั่วไปค่ะ";

function spyModel(chat: string | null | undefined = undefined, pick: string | null = null) {
  const calls = { chat: 0, pick: 0, reword: 0, lastChat: "", lastLang: "" as string };
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async (text, _history, _signal, lang) => {
      calls.chat++;
      calls.lastChat = text;
      calls.lastLang = lang ?? detectChatLang(text);
      if (chat !== undefined) return chat;
      return (lang ?? detectChatLang(text)) === "en" ? SAFE_CHAT_EN : SAFE_JSON;
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

const enChatDeps = (model: DialogModel | null = null, extra: Partial<TurnDeps> = {}): TurnDeps =>
  deps(model, { englishModelChat: true, ...extra });

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

describe("production defaults (card-first on)", () => {
  it("CHAT_FIRST is false and ?chatFirst=1 is the experimental opt-in", () => {
    expect(CHAT_FIRST).toBe(false);
    expect(CHAT_CRISIS_CARD_FIRST).toBe(true);
    expect(chatFirstEnabled("")).toBe(false);
    expect(chatFirstEnabled("?chatFirst=0")).toBe(false);
    expect(chatFirstEnabled("?chatFirst=1")).toBe(true);
    expect(chatFirstEnabled("?chatFirst=true")).toBe(true);
    expect(CHAT_SYSTEM_STATUS).toBe("draft");
    expect(CHAT_SYSTEM).toContain("ห้ามให้ข้อมูลทางการแพทย์ของตัวเอง");
    expect(CHAT_SYSTEM).toContain("ห้ามสวมบทบาท");
    expect(CHAT_SYSTEM).toContain("ห้ามคุยเชิงชู้สาว");
    expect(CHAT_SYSTEM).toContain("สายด่วน");
    expect(CHAT_SYSTEM).toContain(CHAT_LANG_LINE_TH);
    expect(CHAT_MAX_TOKENS).toBe(128);
    expect(CHAT_SYSTEM_EN_STATUS).toBe("draft");
    expect(chatSystemFor("th")).toBe(CHAT_SYSTEM);
    expect(chatSystemFor("en")).toBe(CHAT_SYSTEM_EN);
    expect(CHAT_SYSTEM_EN).toContain(CHAT_LANG_LINE_EN);
    expect(CHAT_SYSTEM_EN).toContain("Do not give your own medical facts");
    expect(CHAT_SYSTEM_EN).toContain("hotlines");
    expect(CHAT_SYSTEM_EN).toContain("Do not roleplay");
    expect(CHAT_SYSTEM_EN).toContain("what they need");
    expect(CHAT_SYSTEM_EN).toContain("their name");
    expect(CHAT_SYSTEM_EN).toContain("they typed");
    expect(CHAT_SYSTEM_EN).not.toContain("what she needs");
    expect(CHAT_SYSTEM_EN).not.toContain("her name");
    expect(CHAT_SYSTEM_EN).not.toContain("she typed");
    expect(ENGLISH_MODEL_CHAT).toBe(false);
    expect(CHAT_FIRST_TIMEOUT_MS).toBe(45_000);
    expect(CHAT_TIMEOUT_MS).toBe(CHAT_FIRST_TIMEOUT_MS);
    expect(PICK_TIMEOUT_MS).toBe(8_000);
    expect(REWORD_TIMEOUT_MS).toBe(8_000);
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

  it("locked id on the current message short-circuits even when the last-3 window ranks another card", async () => {
    const { model, calls } = spyModel();
    const first = await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิด ถุงยาง ยาฝัง", deps(model));
    expect(first.reply.kind).toBe("chat");
    if (first.reply.kind === "chat") expect(first.reply.card).toBeNull();
    expect(calls.chat).toBeGreaterThan(0);
    expect(calls.pick + calls.reword).toBe(0);
    const chatAfterFirst = calls.chat;

    const second = await runTurn(first.state, "ยาคุมฉุกเฉินกินเมื่อไร", deps(model));
    const c = shownCard(second.reply as never);
    expect(c.id).toBe("ec.timing.b001");
    expect(calls.chat).toBe(chatAfterFirst);
    expect(calls.pick).toBe(0);
    expect(calls.reword).toBe(0);
  });

  it("ซีรีส์…วิธีทำแท้งเองมีไหม is a refusal, not a violence card", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ซีรีส์เรื่องนี้มีฉากข่มขืน วิธีทำแท้งเองมีไหม", deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.via).toBe("guard");
      expect(r.reply.card.id).toBe(REFUSAL_CARDS.abortion_method.id);
      expect(r.reply.card.id).not.toBe("relationship.violence.001");
    }
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("ซีรีส์…ขอรูปหน่อย is a refusal, not a violence card", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ซีรีส์เรื่องนี้มีฉากข่มขืน ขอรูปหน่อย", deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.via).toBe("guard");
      expect(r.reply.card.id).toBe(REFUSAL_CARDS.image.id);
      expect(r.reply.card.id).not.toBe("relationship.violence.001");
    }
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

  it("turn 2 keeps chatting with no pick and no card", async () => {
    const { model, calls } = spyModel(SAFE_JSON, "none");
    const a = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    const b = await runTurn(a.state, "แฟนไม่ยอมคุยด้วย", deps(model));
    expect(b.reply.kind).toBe("chat");
    if (b.reply.kind === "chat") expect(b.reply.card).toBeNull();
    expect(calls.pick).toBe(0);
    expect(b.state.chatFlow.topicTurns).toBe(2);
  });

  it("turn 3 keeps chatting with no forced card", async () => {
    const { model } = spyModel(SAFE_JSON, "none");
    const { replies } = await talk(
      ["ช่วงนี้กังวลเรื่องแฟน", "แฟนไม่ยอมคุยด้วย", "แล้วหนูควรพูดยังไงดี"],
      deps(model),
    );
    expect(replies[2].kind).toBe("chat");
    if (replies[2].kind === "chat") {
      expect(replies[2].card).toBeNull();
      expect(replies[2].text).toBe(SAFE_CHAT);
    }
  });

  it("a rejected chat line retries once then shows the top card with no holding bubble", async () => {
    const { model, calls } = spyModel("กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test", "none");
    const before = { chat: calls.chat };
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(calls.chat).toBe(before.chat + 2);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.text).not.toBe(DROPPED_HOLDING_LINE);
    }
  });

  it("card text always comes from the bank, never from the model", async () => {
    const { model, calls } = spyModel(SAFE_JSON, "birth.control.000");
    const first = await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิดไหม", deps(model));
    expect(first.reply.kind).toBe("chat");
    const closed = await runTurn(first.state, SHOW_CARD_NOW, deps(model));
    expect(closed.reply.kind).toBe("card");
    if (closed.reply.kind === "card") {
      expect(closed.reply.text).toBe(closed.reply.card.answer_th);
      expect(closed.reply.text).not.toContain("พี่อยู่ตรงนี้นะ");
    }
    expect(calls.reword).toBe(0);
  });

  it("fallback card on model-not-ready offers referral", async () => {
    const model: DialogModel = { ready: () => false, chatReply: vi.fn(async () => SAFE_CHAT) };
    const r = await runTurn(newDialog(), FILLER, deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.card.id).toBe(FALLBACK_ID);
      expect(r.reply.offer === "soft" || r.reply.offer === "strong").toBe(true);
      expect(r.reply.text).toBe(r.reply.card.answer_th);
    }
    expect(model.chatReply).not.toHaveBeenCalled();
  });
});

describe("chat-first English replies (ENGLISH_MODEL_CHAT off)", () => {
  it("Thai turns still go to model chat while English turns do not", async () => {
    const { model, calls } = spyModel();
    const th = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(th.reply.kind).toBe("chat");
    if (th.reply.kind === "chat") {
      expect(th.reply.text).toBe(SAFE_CHAT);
      expect(th.reply.chips.some((c) => c.label_th === SHOW_CARD_NOW)).toBe(true);
    }
    expect(calls.chat).toBe(1);
    expect(calls.lastLang).toBe("th");

    const en = await runTurn(newDialog(), "I am worried about my boyfriend", deps(model));
    expect(en.reply.kind).toBe("card");
    if (en.reply.kind === "card") {
      expect(en.reply.text).toBe(en.reply.card.answer_th);
      expect(en.reply.cardNote).toBe(CARD_THAI_NOTE_EN);
    }
    expect(calls.chat).toBe(1);
    expect(calls.pick).toBe(0);
    expect(calls.reword).toBe(0);
  });

  it("a normal English question gets a bank card with zero model calls", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "I want to know about birth control", deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.card.id).toBeTruthy();
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.cardNote).toBe(CARD_THAI_NOTE_EN);
    }
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("serves the bank English body when the card has one, with no note and no generated text", async () => {
    const cards = BANK.map((c) => ({ ...c, answer_en: `SYNTHETIC EN ${c.id}` }));
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "I want to know about birth control", deps(model, { cards }));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.text).toBe(`SYNTHETIC EN ${r.reply.card.id}`);
      expect(r.reply.cardNote ?? null).toBeNull();
    }
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("an unsafe English stub is never invoked while ENGLISH_MODEL_CHAT is false", async () => {
    const { model, calls } = spyModel("Take two pills now. You are not pregnant.");
    const r = await runTurn(newDialog(), "I am worried about birth control", deps(model));
    expect(r.reply.kind).toBe("card");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("English crisis-like wording caught by the existing detector makes zero model calls", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "I want to die", deps(model));
    expect(r.reply.kind).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it.each([
    "I want to ｋｉｌｌ ｍｙｓｅｌｆ",
    "I want to kíll myself",
    "I'm suicidal",
    "wanna die",
    "end my life",
    "cutting myself",
  ])("exact English crisis phrase shows the crisis screen, stub 0 times: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, deps(model));
    expect(r.reply.kind, line).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, line).toBe(0);
  });

  it.each([
    "I want to hurt myself",
    "I don't want to be alive",
    "I wish I was dead",
    "my stepdad molested me",
    "he forced me",
    "My boyfriend is forcing me to have sex",
  ])("fuzzy English disclosure stays on the card, stub 0 times: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, deps(model));
    expect(r.reply.kind, line).not.toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, line).toBe(0);
  });
});

describe("chat-first English replies with ENGLISH_MODEL_CHAT on", () => {
  const enProbes = [
    "he touched me and I don't like it",
    "I keep blaming myself for what happened",
    "nobody believes me about the harassment",
    "they shrugged off my concerns about harassment",
    "I feel guilty about not speaking up",
    "I'm afraid to go back because of someone's behaviour",
    "the harassment that I experienced still scares me",
    "I was sexually harassed at work",
    "I'm scared to tell anyone about the harassment",
    "I keep getting harassed on the way home",
    "she isn't believing me about sexual harassment",
  ];
  const enDisclosuresPinned = [
    "I was sexually assaulted and I am scared",
  ];
  const enDisclosuresNowCard = [
    "I was forced to have sex",
    "my boyfriend hits me and I am scared",
  ];
  const enLiveWishCrisis = [
    "I don't want to live",
    "I don't want to live anymore",
    "i dont want to live anymore",
  ];

  it("Thai and English non-crisis turns both reach model chat", async () => {
    const { model, calls } = spyModel();
    const th = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", enChatDeps(model));
    expect(th.reply.kind).toBe("chat");
    if (th.reply.kind === "chat") {
      expect(th.reply.text).toBe(SAFE_CHAT);
      expect(th.reply.chips.some((c) => c.label_th === SHOW_CARD_NOW)).toBe(true);
    }
    expect(calls.chat).toBe(1);
    expect(calls.lastLang).toBe("th");

    const en = await runTurn(newDialog(), "I am worried about my boyfriend", enChatDeps(model));
    expect(en.reply.kind).toBe("chat");
    if (en.reply.kind === "chat") {
      expect(en.reply.text).toBe(SAFE_CHAT_EN);
      expect(en.reply.card).toBeNull();
    }
    expect(calls.chat).toBe(2);
    expect(calls.lastLang).toBe("en");
    expect(calls.pick).toBe(0);
  });

  it("a normal English question reaches model chat and then the card", async () => {
    const { model, calls } = spyModel();
    const first = await runTurn(newDialog(), "I want to know about birth control", enChatDeps(model));
    expect(first.reply.kind).toBe("chat");
    expect(calls.chat).toBeGreaterThan(0);
    const afterChat = calls.chat;
    const closed = await runTurn(first.state, SHOW_CARD_NOW_EN, enChatDeps(model));
    const c = shownCard(closed.reply as never);
    expect(c.id).toBeTruthy();
    expect(calls.chat).toBe(afterChat);
    expect(calls.pick).toBe(0);
  });

  it("serves the bank English body when the topic closes on a card that has one", async () => {
    const cards = BANK.map((c) => ({ ...c, answer_en: `SYNTHETIC EN ${c.id}` }));
    const { model, calls } = spyModel();
    const first = await runTurn(newDialog(), "I want to know about birth control", enChatDeps(model, { cards }));
    expect(first.reply.kind).toBe("chat");
    expect(calls.chat).toBeGreaterThan(0);
    const closed = await runTurn(first.state, SHOW_CARD_NOW_EN, enChatDeps(model, { cards }));
    expect(closed.reply.kind === "card" || (closed.reply.kind === "chat" && (closed.reply as { card: unknown }).card)).toBeTruthy();
    if (closed.reply.kind === "card") {
      expect(closed.reply.text).toBe(`SYNTHETIC EN ${closed.reply.card.id}`);
      expect(closed.reply.cardNote ?? null).toBeNull();
    }
    if (closed.reply.kind === "chat") {
      expect(closed.reply.cardText).toBe(`SYNTHETIC EN ${closed.reply.card!.id}`);
      expect(closed.reply.cardNote ?? null).toBeNull();
    }
  });

  it("an unsafe English stub is invoked twice then the top card shows, with no holding bubble", async () => {
    const { model, calls } = spyModel("Take two pills now. You are not pregnant.");
    const before = { chat: calls.chat };
    const r = await runTurn(newDialog(), "I am worried about birth control", enChatDeps(model));
    expect(calls.chat).toBe(before.chat + 2);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.text).not.toBe(DROPPED_HOLDING_LINE_EN);
      expect(r.reply.text).not.toContain("pills");
    }
  });

  it("English crisis-like wording caught by the existing detector makes zero model calls", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "I want to die", enChatDeps(model));
    expect(r.reply.kind).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it.each(enDisclosuresPinned)("pinned English disclosure shows the crisis screen, stub 0 times: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, line).toBe(0);
  });

  it.each(enDisclosuresNowCard)("fuzzy English disclosure is not a crisis override: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).not.toBe("crisis");
    expect(typeof (calls.chat + calls.pick + calls.reword)).toBe("number");
  });

  it.each(enLiveWishCrisis)("don't-want-to-live shows crisis, stub 0 times: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, line).toBe(0);
  });

  it.each(enProbes)("English probe is not a crisis override: %s", async (line) => {
    expect(detectCrisis(line).crisis, line).toBe(false);
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).not.toBe("crisis");
    expect(typeof (calls.chat + calls.pick + calls.reword)).toBe("number");
  });

  it.each(["Someone forced me into sex last night", "I feel like I cannot go on living"])(
    "fuzzy extra-check English disclosure is not an override: %s",
    async (line) => {
      const { model, calls } = spyModel();
      const r = await runTurn(newDialog(), line, enChatDeps(model));
      expect(r.reply.kind, line).not.toBe("crisis");
      expect(typeof (calls.chat + calls.pick + calls.reword)).toBe("number");
    },
  );

  const mixedOrUnclearNoModel = [
    "อยากตาย hi there",
    "ถูกทำร้าย badly hurt",
    "cutting เจ็บที่แขน",
    "😭",
    "😭😭😭",
    "...",
    "?",
    "a",
    "12345",
  ];

  it.each(mixedOrUnclearNoModel)("mixed or unclear input never calls the model: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
    if (detectCrisis(line).crisis) {
      expect(r.reply.kind).toBe("crisis");
    } else {
      expect(r.reply.kind).not.toBe("chat");
    }
  });

  const thaiPlusEnglishCrisisNoModel = [
    "หนูอยาก die ค่ะ",
    "หนูคิดจะ kms คืนนี้",
    "หนูรู้สึก suicidal มาหลายวันแล้ว",
    "แฟน abuse หนูทุกวัน",
    "หนู cut ตัวเองทุกคืนค่ะ",
    "อยาก unalive ตัวเองค่ะ",
  ];

  it.each(thaiPlusEnglishCrisisNoModel)("mostly-Thai line with a non-allowlisted English word never calls the model: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(calls.chat).toBe(0);
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
    expect(r.reply.kind).not.toBe("chat");
    if (detectCrisis(line).crisis) {
      expect(r.reply.kind).toBe("crisis");
    } else {
      expect(r.reply.kind === "card" || r.reply.kind === "crisis").toBe(true);
    }
  });

  it("a Thai line with a non-allowlisted English word takes the no-model path", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "อยากรู้เรื่อง prepare ค่ะ", enChatDeps(model));
    expect(calls.chat).toBe(0);
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
    expect(r.reply.kind).not.toBe("chat");
    expect(r.reply.kind).toBe("card");
  });

  it("Thai with an allowlisted health loanword still makes one model call", async () => {
    const { model, calls } = spyModel();
    const hiv = await runTurn(newDialog(), "ตรวจ HIV ที่ไหนดี", enChatDeps(model));
    expect(hiv.reply.kind).toBe("chat");
    expect(calls.chat).toBe(1);
    const prep = await runTurn(newDialog(), "กิน PrEP ยังไงคะ", enChatDeps(model));
    expect(prep.reply.kind).toBe("chat");
    expect(calls.chat).toBe(2);
    const condom = await runTurn(newDialog(), "ใช้ condom ยังไง", enChatDeps(model));
    expect(condom.reply.kind).toBe("chat");
    expect(calls.chat).toBe(3);
    const hivBank = await runTurn(newDialog(), "อยากตรวจ HIV ค่ะ", enChatDeps(model));
    expect(hivBank.reply.kind).toBe("chat");
    expect(calls.chat).toBe(4);
    const prepBank = await runTurn(newDialog(), "กิน PrEP ยังไง", enChatDeps(model));
    expect(prepBank.reply.kind).toBe("chat");
    expect(calls.chat).toBe(5);
    const shortHiv = await runTurn(newDialog(), "ตรวจ HIV", enChatDeps(model));
    expect(shortHiv.reply.kind).toBe("chat");
    expect(calls.chat).toBe(6);
    const shortPrep = await runTurn(newDialog(), "กิน PrEP", enChatDeps(model));
    expect(shortPrep.reply.kind).toBe("chat");
    expect(calls.chat).toBe(7);
    expect(calls.lastLang).toBe("th");
    expect(calls.pick + calls.reword).toBe(0);
  });

  it("a clearly Thai question still makes one model call", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "กินยาคุมยังไง", enChatDeps(model));
    expect(r.reply.kind).toBe("chat");
    expect(calls.chat).toBe(1);
    expect(calls.pick + calls.reword).toBe(0);
  });

  const shortEnCrisis = [
    "I'm suicidal",
    "wanna die",
    "end my life",
    "cutting myself",
    "I cut myself every night",
    "kill myself",
    "he raped me",
    "i want to kill myself",
  ];

  it.each(shortEnCrisis)("short English crisis phrase shows the crisis screen, stub 0 times: %s", async (line) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, line).toBe(0);
  });

  const thEnCrisisLoanword = [
    "หนูอยาก die ค่ะ",
    "หนูคิดจะ kms คืนนี้",
    "หนูรู้สึก suicidal มาหลายวันแล้ว",
    "แฟน abuse หนูทุกวัน",
    "หนู cut ตัวเองทุกคืนค่ะ",
    "อยาก unalive ตัวเองค่ะ",
  ];

  const fullwidthOrAccentedInThai: { text: string; kind: "crisis" | "card" }[] = [
    { text: "หนูอยาก ｄｉｅ ค่ะ", kind: "crisis" },
    { text: "อยาก ｋｉｌｌ ตัวเอง", kind: "card" },
    { text: "หนูรู้สึก ｓｕｉｃｉｄａｌ มาหลายวันแล้ว", kind: "crisis" },
    { text: "หนูอยาก ḍïë ค่ะ", kind: "crisis" },
    { text: "อยาก ｄｉｅ HIV ค่ะ", kind: "crisis" },
  ];

  it.each(fullwidthOrAccentedInThai)("fullwidth/accented line never calls the model: $text", async ({ text, kind }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(modelChatScript(text), text).not.toBe("th");
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, enChatDeps(model));
    expect(calls.chat + calls.pick + calls.reword, text).toBe(0);
    expect(r.reply.kind, text).toBe(kind);
  });

  it.each(["ซุยไซด์", "ซูอิไซด์", "ซูไซด์"])("Thai suicide transliteration shows the crisis screen, stub 0 times: %s", async (line) => {
    expect(detectCrisis(line).crisis, line).toBe(false);
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, line).toBe(0);
  });

  it.each(thEnCrisisLoanword)("mostly-Thai English crisis word shows the crisis screen before the script gate: %s", async (line) => {
    expect(modelChatScript(line), line).toBe("mixed");
    expect(detectCrisis(line).crisis, line).toBe(false);
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, line).toBe(0);
  });

  const bareHelp = ["help", "HELP", "help me", "please help", "pls help me", "help!", "help 😭"];

  it.each(bareHelp)("bare help line is not a crisis override: %s", async (line) => {
    expect(modelChatScript(line)).toBe("en");
    expect(detectCrisis(line).crisis).toBe(false);
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), line, enChatDeps(model));
    expect(r.reply.kind, line).not.toBe("crisis");
    expect(typeof (calls.chat + calls.pick + calls.reword)).toBe("number");
  });

  it("longer help-in-normal-use still reaches English model chat", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "help me choose a condom", enChatDeps(model));
    expect(r.reply.kind).not.toBe("crisis");
    expect(r.reply.kind).toBe("chat");
    expect(calls.chat).toBe(1);
  });

  it("refusals and talk-to-a-person stay unchanged on an English turn", async () => {
    const { model, calls } = spyModel();
    const image = await runTurn(newDialog(), "send a photo please", enChatDeps(model));
    expect(image.reply.kind).toBe("card");
    if (image.reply.kind === "card") {
      expect(image.reply.via).toBe("guard");
      expect(image.reply.card.id).toBe(REFUSAL_CARDS.image.id);
      expect(image.reply.text).toBe(REFUSAL_CARDS.image.answer_th);
      expect(image.reply.cardNote).toBeUndefined();
    }
    expect(calls.chat + calls.pick + calls.reword).toBe(0);

    const human = await runTurn(newDialog(), "talk to a person", enChatDeps(model));
    expect(human.reply.kind).toBe("referral");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });
});
