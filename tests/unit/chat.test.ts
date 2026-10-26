import { describe, it, expect } from "vitest";
import type { CrisisCategory, Intent } from "../../src/core/types";
import { HARD_CAP, newNeedGate, bumpNeed } from "../../src/core/dialog";
import { newChat, sendToChat, type ChatHooks } from "../../src/ui/chat";

// SYNTHETIC chat lines only.
const FILLER = "อยากรู้เรื่องทั่วไปค่ะ";
const EC_TEXT = "ถุงยางรั่ว คุมฉุกเฉินทันไหม";
const NEWS_ASK = "ข่าววันนี้ เรื่องฆ่าตัวตาย อยากคุยกับเจ้าหน้าที่";

function hooks() {
  const referralIntents: Intent[][] = [];
  const referralBanners: CrisisCategory[][] = [];
  const h: ChatHooks & { crisisCalls: number; referralIntents: Intent[][]; referralBanners: CrisisCategory[][] } = {
    crisisCalls: 0,
    referralIntents,
    referralBanners,
    rerender: () => {},
    crisis: () => { h.crisisCalls++; },
    referral: (intents, banner = []) => { referralIntents.push(intents); referralBanners.push(banner); },
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
    expect(h.referralBanners).toEqual([[]]);
    expect(h.crisisCalls).toBe(0);
  });

  it("passes the chat's active crisis banner into referral (sticky after override, and topic-context banner)", async () => {
    const afterCrisis = newChat("15-17", null);
    const h1 = hooks();
    await sendToChat(afterCrisis, EC_TEXT, h1);
    await sendToChat(afterCrisis, "อยากตาย", h1);
    expect(h1.crisisCalls).toBe(1);
    expect(afterCrisis.session.state.crisisFired).toBe(true);
    await sendToChat(afterCrisis, "อยากคุยกับเจ้าหน้าที่", h1);
    expect(h1.referralIntents.at(-1)).toEqual(["emergency_contraception"]);
    expect(h1.referralBanners.at(-1)).toEqual(["self_harm"]);

    const news = newChat("18-24", null);
    const h2 = hooks();
    await sendToChat(news, NEWS_ASK, h2);
    expect(h2.crisisCalls).toBe(0);
    expect(h2.referralIntents).toHaveLength(1);
    expect(h2.referralBanners[0]).toEqual(["self_harm"]);
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
