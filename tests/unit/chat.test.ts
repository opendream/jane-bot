import { describe, it, expect } from "vitest";
import type { Intent } from "../../src/core/types";
import { HARD_CAP, newNeedGate, bumpNeed } from "../../src/core/dialog";
import { newChat, sendToChat, type ChatHooks } from "../../src/ui/chat";

// SYNTHETIC chat lines only.
const FILLER = "อยากรู้เรื่องทั่วไปค่ะ";

function hooks() {
  const referralIntents: Intent[][] = [];
  const h: ChatHooks & { crisisCalls: number; referralIntents: Intent[][] } = {
    crisisCalls: 0,
    referralIntents,
    rerender: () => {},
    crisis: () => { h.crisisCalls++; },
    referral: (intents) => { referralIntents.push(intents); },
  };
  return h;
}

describe("chat send path", () => {
  it("talk-to-a-person calls the referral hook with the current topic (no empty promise)", async () => {
    const chat = newChat("18-24", null);
    const h = hooks();
    await sendToChat(chat, "ช่วงนี้เครียดมาก นอนไม่หลับ", h);
    await sendToChat(chat, "อยากคุยกับเจ้าหน้าที่", h);
    expect(h.referralIntents).toEqual([["mental_health"]]);
    expect(h.crisisCalls).toBe(0);
  });

  it("after the hard cap, crisis text still reaches detection and shows the crisis card", async () => {
    const chat = newChat("18-24", null);
    const h = hooks();
    for (let i = 0; i < HARD_CAP; i++) await sendToChat(chat, FILLER, h);
    expect(chat.readOnly).toBe(true);
    expect(chat.messages.some((m) => m.cap === "hard" || m.note === "readonly")).toBe(true);
    await sendToChat(chat, "อยากตาย", h);
    expect(h.crisisCalls).toBe(1);
  });

  it("a slow turn that no longer owns the NeedGate seq drops with no landing rerender and no crisis", async () => {
    const chat = newChat("18-24", null);
    const gate = newNeedGate();
    let renders = 0;
    const h: ChatHooks & { crisisCalls: number } = {
      crisisCalls: 0,
      seq: () => gate.seq,
      rerender: () => { renders++; },
      crisis: () => { h.crisisCalls++; },
    };
    const orig = chat.session.send.bind(chat.session);
    chat.session.send = async (text) => {
      await new Promise((r) => setTimeout(r, 60));
      return orig(text);
    };
    const pending = sendToChat(chat, "อยากตาย", h);
    bumpNeed(gate); // erase
    bumpNeed(gate); // quick exit
    await pending;
    expect(h.crisisCalls).toBe(0);
    expect(renders).toBe(1); // busy start only; the landing must not rerender
    expect(chat.busy).toBe(false);
    expect(chat.messages.some((m) => m.from === "jane" && m.cardId && m.cardId !== "general.welcome.000")).toBe(false);
  });
});
