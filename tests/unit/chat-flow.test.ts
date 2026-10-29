import { describe, expect, it } from "vitest";
import { CHAT_MAX_TURNS } from "../../src/config";
import {
  SHOW_CARD_NOW,
  applyChatTurn,
  applyClosedCard,
  applyCrisis,
  isDirectFactualQuestion,
  isShowCardNow,
  newChatFlow,
  planTurn,
  shouldCloseAfterReject,
  showCardNowChip,
} from "../../src/core/chat-flow";

describe("chat-first state machine", () => {
  it("starts in AFTER so the welcome card is not a chat topic", () => {
    const f = newChatFlow();
    expect(f.phase).toBe("after");
    expect(f.topicTurns).toBe(0);
    expect(f.rulesOnly).toBe(false);
  });

  it("counts topic turns and always closes at turn 3", () => {
    expect(CHAT_MAX_TURNS).toBe(3);
    const flow = newChatFlow();
    const t1 = planTurn({
      flow, crisis: "none", guard: false, human: false, chip: false, showNow: false,
      locked: false, rulesConfident: false, directQuestion: false,
    });
    expect(t1).toMatchObject({ reason: "chat", topicTurn: 1, callChat: true, callPick: false, close: "never" });

    const after1 = applyChatTurn(flow, "ช่วงนี้กังวลเรื่องแฟน", "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย", false);
    expect(after1.phase).toBe("chat");
    expect(after1.topicTurns).toBe(1);

    const t2 = planTurn({
      flow: after1, crisis: "none", guard: false, human: false, chip: false, showNow: false,
      locked: false, rulesConfident: false, directQuestion: false,
    });
    expect(t2).toMatchObject({ reason: "chat", topicTurn: 2, callChat: true, callPick: true, close: "if-pick" });

    const after2 = applyChatTurn(after1, "แฟนไม่ยอมใส่ถุงยาง", "เล่าเพิ่มได้เลยนะ", false);
    const t3 = planTurn({
      flow: after2, crisis: "none", guard: false, human: false, chip: false, showNow: false,
      locked: false, rulesConfident: false, directQuestion: false,
    });
    expect(t3).toMatchObject({ reason: "chat", topicTurn: 3, callChat: true, callPick: true, close: "always" });
  });

  it("turn 1 that is rules-confident and a direct question closes with a card (no pick)", () => {
    const t1 = planTurn({
      flow: newChatFlow(), crisis: "none", guard: false, human: false, chip: false, showNow: false,
      locked: false, rulesConfident: true, directQuestion: true,
    });
    expect(t1).toMatchObject({ reason: "chat", topicTurn: 1, callChat: true, callPick: false, close: "always" });
  });

  it("the ขอข้อมูลเลย chip is recognised and is rules-only", () => {
    expect(showCardNowChip().label_th).toBe(SHOW_CARD_NOW);
    expect(isShowCardNow("ขอข้อมูลเลย")).toBe(true);
    expect(isShowCardNow("ขอ ข้อมูล เลย")).toBe(true);
    const t = planTurn({
      flow: applyChatTurn(newChatFlow(), "กังวลเรื่องท้อง", "เล่าเพิ่มได้เลยนะ", false),
      crisis: "none", guard: false, human: false, chip: false, showNow: true,
      locked: false, rulesConfident: false, directQuestion: false,
    });
    expect(t).toMatchObject({ reason: "show-now", callChat: false, callPick: false, close: "always" });
  });

  it("after a crisis hit the rest of the session is rules-only", () => {
    const locked = applyCrisis(applyChatTurn(newChatFlow(), "ช่วงนี้เครียด", "พี่อยู่ตรงนี้นะ", false));
    expect(locked.rulesOnly).toBe(true);
    const t = planTurn({
      flow: locked, crisis: "none", guard: false, human: false, chip: false, showNow: false,
      locked: false, rulesConfident: true, directQuestion: true,
    });
    expect(t).toMatchObject({ reason: "post-crisis", callChat: false, callPick: false });
  });

  it("crisis / banner / guard / human / chip / locked never call the model", () => {
    const flow = newChatFlow();
    for (const crisis of ["override", "banner"] as const) {
      const t = planTurn({
        flow, crisis, guard: false, human: false, chip: false, showNow: false,
        locked: false, rulesConfident: false, directQuestion: false,
      });
      expect(t.callChat, crisis).toBe(false);
      expect(t.callPick, crisis).toBe(false);
    }
    for (const flag of ["guard", "human", "chip", "locked"] as const) {
      const t = planTurn({
        flow, crisis: "none",
        guard: flag === "guard", human: flag === "human", chip: flag === "chip",
        showNow: false, locked: flag === "locked",
        rulesConfident: false, directQuestion: false,
      });
      expect(t.callChat, flag).toBe(false);
      expect(t.callPick, flag).toBe(false);
    }
  });

  it("a new free-text after a closed card starts topic turn 1", () => {
    const chatting = applyChatTurn(newChatFlow(), "กังวลเรื่องท้อง", "เล่าเพิ่มได้เลยนะ", false);
    const closed = applyClosedCard(chatting);
    expect(closed.phase).toBe("after");
    const next = planTurn({
      flow: closed, crisis: "none", guard: false, human: false, chip: false, showNow: false,
      locked: false, rulesConfident: false, directQuestion: false,
    });
    expect(next.topicTurn).toBe(1);
    expect(next.reason).toBe("chat");
  });

  it("a second reject in the topic closes with the card", () => {
    const f = applyChatTurn(newChatFlow(), "กังวลเรื่องท้อง", "holding", true);
    expect(f.rejectCount).toBe(1);
    expect(shouldCloseAfterReject(f, true)).toBe(true);
    expect(shouldCloseAfterReject(f, false)).toBe(false);
  });

  it("detects a direct factual question", () => {
    expect(isDirectFactualQuestion("คุมฉุกเฉินทันไหม")).toBe(true);
    expect(isDirectFactualQuestion("อยากรู้เรื่องคุมกำเนิด")).toBe(false);
    expect(isDirectFactualQuestion("PrEP คืออะไร")).toBe(true);
  });
});
