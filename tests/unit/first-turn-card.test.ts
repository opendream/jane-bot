import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { shippable } from "../../src/core/bank";
import { detectChatCrisisForTurn } from "../../src/core/chat-crisis";
import { detectCrisis } from "../../src/core/crisis";
import {
  FALLBACK_ID,
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import { retrieve } from "../../src/core/retrieve";
import {
  firstTurnChoice,
  formatChatReply,
  parseChatChoice,
  renderChatChoice,
  renderChatChoiceForTurn,
} from "../../src/llm/chat-choice";
import { groundingCard } from "../../src/llm/chat-ground";
import {
  CARD_OFFER_FOLLOWUPS,
  CHAT_FOLLOWUPS_EN,
  CHAT_FOLLOWUPS_TH,
  CHAT_OPENERS_EN,
  CHAT_OPENERS_TH,
} from "../../src/llm/chat-voice";

const STUDIO = "ถุงยางอนามัยใช้ยังไงให้ถูกต้อง";
const CHAT_ONLY = "ถุงยางแตกทำไงดี";
const DIRECT = "ถุงยางแตกต้องทำยังไง";
const NONE_JSON = '{"o":0,"c":0,"q":0}';
const EN_OFFER_NO_CARD_JSON = '{"o":0,"c":0,"q":2}';

const HOW_TO = BANK.find((c) => c.id === "condom.how_to.000")!;
const LEAK = BANK.find((c) => c.id === "condom.leak.000")!;
const pool = BANK.filter((c) => shippable(c, "reviewed") && c.id !== FALLBACK_ID && c.id !== "general.welcome.000");

function spyModel(reply: string) {
  const calls = { chat: 0 };
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async () => {
      calls.chat++;
      return reply;
    }),
    pickCard: vi.fn(async () => "none"),
  };
  return { model, calls };
}

const deps = (model: DialogModel, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "reviewed", chatFirst: true, ...extra,
});

describe("firstTurnChoice (pure)", () => {
  const choice = { o: 0, c: 0 as const, q: 1 };

  it("forces c=1 on turn 1 with a ground card and no bubble", () => {
    expect(firstTurnChoice(choice, { topicTurn: 1, hasGroundCard: true, cardBubble: false }))
      .toEqual({ o: 0, c: 1, q: 1 });
  });

  it("keeps the model's c when there is no ground card", () => {
    expect(firstTurnChoice(choice, { topicTurn: 1, hasGroundCard: false, cardBubble: false })).toEqual(choice);
  });

  it("keeps the model's c when a card bubble shows", () => {
    expect(firstTurnChoice({ o: 2, c: 1, q: 0 }, { topicTurn: 1, hasGroundCard: true, cardBubble: true }))
      .toEqual({ o: 2, c: 1, q: 0 });
    expect(firstTurnChoice(choice, { topicTurn: 1, hasGroundCard: true, cardBubble: true })).toEqual(choice);
  });

  it("does not force on turns 2 and 3", () => {
    expect(firstTurnChoice(choice, { topicTurn: 2, hasGroundCard: true, cardBubble: false })).toEqual(choice);
    expect(firstTurnChoice(choice, { topicTurn: 3, hasGroundCard: true, cardBubble: false })).toEqual(choice);
  });
});

describe("forced first-turn card (dialog, stub JSON)", () => {
  it("turn 1 confident, no bubble, stub c=0: opener + answer_th + follow-up 0", async () => {
    const { model, calls } = spyModel(NONE_JSON);
    const r = await runTurn(newDialog("18-24"), CHAT_ONLY, deps(model));
    expect(calls.chat).toBe(1);
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card).toBeNull();
    expect(r.reply.text).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, LEAK.answer_th, CHAT_FOLLOWUPS_TH[0]!));
    expect(r.reply.text).toContain(LEAK.answer_th);
    expect(r.state.chatFlow.topicTurns).toBe(1);
    expect(r.state.chatFlow.phase).toBe("chat");
  });

  it("turn 1 not confident: honours the model's c=0 and rejects c=1", async () => {
    const { model } = spyModel(NONE_JSON);
    const r = await runTurn(newDialog("18-24"), "ขอสูตรเค้กช็อกโกแลตที่ไม่มีในคลัง", deps(model));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card).toBeNull();
    expect(r.reply.text).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, "", CHAT_FOLLOWUPS_TH[0]!));
    expect(r.reply.text).not.toContain(LEAK.answer_th);

    const parsed = parseChatChoice('{"o":0,"c":1,"q":0}', {
      openerCount: CHAT_OPENERS_TH.length,
      followUpCount: CHAT_FOLLOWUPS_TH.length,
      hasCard: false,
    });
    expect(parsed.ok).toBe(false);
  });

  it("bubble wins: chat text has c=0 and the card appears only on the bubble", async () => {
    const { model } = spyModel(NONE_JSON);
    const r = await runTurn(newDialog("18-24"), DIRECT, deps(model));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card?.id).toBe(LEAK.id);
    expect(r.reply.cardText).toBe(LEAK.answer_th);
    expect(r.reply.text).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, "", CHAT_FOLLOWUPS_TH[0]!));
    expect(r.reply.text).not.toContain(LEAK.answer_th);
  });

  it("bubble card id differs from groundCard: quoted groundCard is kept in the chat text", () => {
    const ground = firstTurnChoice({ o: 0, c: 1, q: 0 }, { topicTurn: 1, hasGroundCard: true, cardBubble: true });
    const text = renderChatChoiceForTurn(ground, "th", HOW_TO.answer_th, true);
    expect(text).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, HOW_TO.answer_th, CHAT_FOLLOWUPS_TH[0]!));
    expect(text).toContain(HOW_TO.answer_th);
    expect(text).not.toContain(LEAK.answer_th);
  });

  it("turns 2 and 3 do not force the model's c=0", async () => {
    const { model } = spyModel(NONE_JSON);
    const t1 = await runTurn(newDialog("18-24"), CHAT_ONLY, deps(model));
    expect(t1.state.chatFlow.topicTurns).toBe(1);
    const t2 = await runTurn(t1.state, "แล้วต้องทำยังไงต่อดี", deps(model));
    expect(t2.state.chatFlow.topicTurns).toBe(2);
    expect(t2.reply.kind).toBe("chat");
    if (t2.reply.kind === "chat" && !t2.reply.card) {
      expect(t2.reply.text).not.toContain(LEAK.answer_th);
    }
  });

  it("CLEAR crisis: crisis route, 0 stub calls, no card forcing", async () => {
    const { model, calls } = spyModel(NONE_JSON);
    const r = await runTurn(newDialog("18-24"), "ตอนนี้อยากตายมาก", deps(model));
    expect(r.reply.kind).toBe("crisis");
    expect(calls.chat).toBe(0);
    expect(detectCrisis("ตอนนี้อยากตายมาก").level).not.toBe("none");
  });

  it("chat-crisis AMBIGUOUS is the bank card plus the DRAFT soft line; never calls the stub", async () => {
    const line = "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง";
    expect(detectCrisis(line).level).toBe("none");
    expect(detectChatCrisisForTurn(line, []).outcome).toBe("ambiguous");
    const { model, calls } = spyModel(NONE_JSON);
    const r = await runTurn(newDialog("18-24"), line, deps(model));
    expect(r.reply.kind).toBe("card");
    expect(calls.chat).toBe(0);
    if (r.reply.kind === "card") expect(r.reply.softCrisis?.line).toMatch(/ไม่ปลอดภัย/);
  });

  it("invalid output on both attempts is the existing rules fallback", async () => {
    const { model, calls } = spyModel("not-json");
    const r = await runTurn(newDialog("18-24"), CHAT_ONLY, deps(model));
    expect(calls.chat).toBe(2);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.text).not.toContain(CHAT_OPENERS_TH[0]!);
    }
  });
});

describe("follow-up swap when a card is shown", () => {
  it("EN card shown + offer follow-up renders follow-up 1", () => {
    expect(CARD_OFFER_FOLLOWUPS.has(CHAT_FOLLOWUPS_EN[2]!)).toBe(true);
    const text = renderChatChoice({ o: 0, c: 1, q: 2 }, "en", "Checked card.");
    expect(text).toBe(formatChatReply(CHAT_OPENERS_EN[0]!, "Checked card.", CHAT_FOLLOWUPS_EN[1]!));
    expect(text).toContain("What would you like to ask next?");
    expect(text).not.toContain("Shall I share the checked information?");
  });

  it("EN no card + the same q keeps the offer string", () => {
    const text = renderChatChoice({ o: 0, c: 0, q: 2 }, "en", "Checked card.");
    expect(text).toBe(formatChatReply(CHAT_OPENERS_EN[0]!, "", CHAT_FOLLOWUPS_EN[2]!));
    expect(text).toContain("Shall I share the checked information?");
  });

  it("EN card bubble + offer q still swaps and keeps the quoted card", () => {
    const text = renderChatChoiceForTurn({ o: 0, c: 1, q: 2 }, "en", "Checked card.", true);
    expect(text).toBe(formatChatReply(CHAT_OPENERS_EN[0]!, "Checked card.", CHAT_FOLLOWUPS_EN[1]!));
    expect(text).not.toContain("Shall I share the checked information?");
  });

  it("TH: no follow-up is in the offer set, so every q is unchanged", () => {
    expect([...CHAT_FOLLOWUPS_TH].some((q) => CARD_OFFER_FOLLOWUPS.has(q))).toBe(false);
    for (let q = 0; q < CHAT_FOLLOWUPS_TH.length; q++) {
      const withCard = renderChatChoice({ o: 0, c: 1, q }, "th", "บัตร");
      const noCard = renderChatChoice({ o: 0, c: 0, q }, "th", "บัตร");
      expect(withCard).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, "บัตร", CHAT_FOLLOWUPS_TH[q]!));
      expect(noCard).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, "", CHAT_FOLLOWUPS_TH[q]!));
    }
  });

  it("EN dialog: no card + offer q keeps the offer string", async () => {
    const { model } = spyModel(EN_OFFER_NO_CARD_JSON);
    const noCard = await runTurn(
      newDialog(),
      "I am worried about my boyfriend",
      deps(model, { englishModelChat: true, copyStatus: "draft" }),
    );
    expect(noCard.reply.kind).toBe("chat");
    if (noCard.reply.kind !== "chat") return;
    expect(noCard.reply.card).toBeNull();
    expect(noCard.reply.text).toContain(CHAT_FOLLOWUPS_EN[2]!);
    expect(noCard.reply.text).not.toContain(CHAT_FOLLOWUPS_EN[1]!);
  });
});

describe("condom.how_to.000 trigger", () => {
  it("retrieve(studio prompt) is confident on condom.how_to.000 and groundingCard returns it", () => {
    const r = retrieve(STUDIO, pool, null);
    expect(r.ranked[0]?.card.id).toBe("condom.how_to.000");
    expect(r.confident).toBe(true);
    expect(groundingCard(r, "18-24")?.id).toBe("condom.how_to.000");
  });

  it("studio prompt on turn 1 with stub c=0 shows the how-to card text", async () => {
    const { model } = spyModel(NONE_JSON);
    const r = await runTurn(newDialog("18-24"), STUDIO, deps(model));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card).toBeNull();
    expect(r.reply.text).toContain(HOW_TO.answer_th);
    expect(r.reply.text.startsWith(CHAT_OPENERS_TH[0]!)).toBe(true);
    expect(r.reply.text.endsWith(CHAT_FOLLOWUPS_TH[0]!)).toBe(true);
  });
});
