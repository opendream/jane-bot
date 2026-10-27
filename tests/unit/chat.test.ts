import { describe, it, expect, vi } from "vitest";
import type { CrisisCategory, Intent } from "../../src/core/types";
import { HARD_CAP, newNeedGate, bumpNeed } from "../../src/core/dialog";
import { startQuiz } from "../../src/core/quiz";
import { applyQuizUpdate, beginQuiz, newChat, sendToChat, type ChatHooks } from "../../src/ui/chat";

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
    await sendToChat(chat, "อยากรู้เรื่องคุมกำเนิด", h);
    await sendToChat(chat, "อยากคุยกับเจ้าหน้าที่", h);
    expect(h.referralIntents).toEqual([["contraception"]]);
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

  it("text typed during a quiz at the read-only cap closes the panel, rerenders, and does not add a bubble", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    let renders = 0;
    h.rerender = () => { renders++; };
    await sendToChat(chat, "ใช้ถุงยาง", h);
    beginQuiz(chat, "contraception", h);
    const closed = chat.quiz;
    expect(closed).not.toBeNull();
    chat.readOnly = true;
    const users = chat.messages.filter((m) => m.from === "user").length;
    const before = renders;
    const line = "อยากรู้เรื่องคุมกำเนิด";
    await sendToChat(chat, line, h);
    expect(chat.quiz).toBeNull();
    expect(chat.readOnly).toBe(true);
    expect(renders).toBeGreaterThan(before);
    expect(chat.messages.filter((m) => m.from === "user" && m.text === line)).toHaveLength(0);
    expect(chat.messages.filter((m) => m.from === "user")).toHaveLength(users);
    applyQuizUpdate(chat, closed, h);
    expect(chat.quiz).toBeNull();
    await sendToChat(chat, line, h);
    expect(chat.messages.filter((m) => m.from === "user" && m.text === line)).toHaveLength(0);
  });

  it("beginQuiz is a no-op when the session is read-only", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    let renders = 0;
    h.rerender = () => { renders++; };
    for (let i = 0; i < HARD_CAP; i++) await sendToChat(chat, FILLER, h);
    expect(chat.readOnly).toBe(true);
    const before = renders;
    beginQuiz(chat, "contraception", h);
    expect(chat.quiz).toBeNull();
    expect(renders).toBe(before);
  });

  it("a crisis line typed during a quiz at the cap still opens the crisis screen", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    await sendToChat(chat, "ใช้ถุงยาง", h);
    beginQuiz(chat, "contraception", h);
    expect(chat.quiz).not.toBeNull();
    chat.readOnly = true;
    const orig = chat.session.send.bind(chat.session);
    let sends = 0;
    chat.session.send = async (text) => { sends++; return orig(text); };
    await sendToChat(chat, "อยากตาย", h);
    expect(h.crisisCalls).toBe(1);
    expect(sends).toBe(1);
    expect(chat.quiz).toBeNull();
    expect(chat.session.state.crisisFired).toBe(true);
  });

  it("non-crisis text typed during the quiz uses the busy path; the closed quiz cannot come back", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    let renders = 0;
    h.rerender = () => { renders++; };
    await sendToChat(chat, "ใช้ถุงยาง", h);
    beginQuiz(chat, "contraception", h);
    const closed = chat.quiz;
    expect(closed).not.toBeNull();
    const orig = chat.session.send.bind(chat.session);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    chat.session.send = async (text) => { await held; return orig(text); };
    const pending = sendToChat(chat, "อยากรู้เรื่องคุมกำเนิด", h);
    expect(chat.quiz).toBeNull();
    expect(chat.busy).toBe(true);
    expect(chat.draft).toBe("");
    expect(chat.messages.filter((m) => m.from === "user" && m.text === "อยากรู้เรื่องคุมกำเนิด")).toHaveLength(1);
    expect(renders).toBeGreaterThan(0);
    applyQuizUpdate(chat, closed, h);
    expect(chat.quiz).toBeNull();
    release();
    await pending;
    expect(chat.busy).toBe(false);
    expect(chat.quiz).toBeNull();
    expect(chat.messages.filter((m) => m.from === "user" && m.text === "อยากรู้เรื่องคุมกำเนิด")).toHaveLength(1);
    expect(chat.messages.some((m) => m.from === "jane" && m.cardId === "birth.control.000")).toBe(true);
  });

  it("a NeedGate bump during a mid-quiz send drops the landing and does not restore the quiz", async () => {
    const chat = newChat("15-17", null);
    const gate = newNeedGate();
    let renders = 0;
    const h: ChatHooks & { crisisCalls: number } = {
      crisisCalls: 0,
      seq: () => gate.seq,
      rerender: () => { renders++; },
      crisis: () => { h.crisisCalls++; },
    };
    await sendToChat(chat, "ใช้ถุงยาง", h);
    beginQuiz(chat, "contraception", h);
    const orig = chat.session.send.bind(chat.session);
    chat.session.send = async (text) => {
      await new Promise((r) => setTimeout(r, 60));
      return orig(text);
    };
    const pending = sendToChat(chat, "อยากรู้เรื่องคุมกำเนิด", h);
    expect(chat.busy).toBe(true);
    expect(chat.quiz).toBeNull();
    bumpNeed(gate);
    bumpNeed(gate);
    await pending;
    expect(h.crisisCalls).toBe(0);
    expect(chat.busy).toBe(false);
    expect(chat.quiz).toBeNull();
    expect(chat.messages.filter((m) => m.from === "jane" && m.cardId === "birth.control.000")).toHaveLength(1);
  });

  it("skips chatDelayMs for a line typed during the quiz but still sets busy immediately", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    await sendToChat(chat, "ใช้ถุงยาง", h);
    beginQuiz(chat, "contraception", h);
    vi.stubGlobal("location", { search: "?chatDelayMs=2000" });
    try {
      const started = Date.now();
      const pending = sendToChat(chat, "อยากรู้เรื่องคุมกำเนิด", h);
      expect(chat.busy).toBe(true);
      expect(chat.quiz).toBeNull();
      await pending;
      expect(Date.now() - started).toBeLessThan(500);
      expect(chat.busy).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a crisis line typed during the quiz is recorded on the session; later turns keep the sticky banner and soft offer", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    await sendToChat(chat, "ใช้ถุงยาง", h);
    beginQuiz(chat, "contraception", h);
    expect(chat.quiz).not.toBeNull();
    const orig = chat.session.send.bind(chat.session);
    let sends = 0;
    chat.session.send = async (text) => { sends++; return orig(text); };
    await sendToChat(chat, "อยากตาย", h);
    expect(h.crisisCalls).toBe(1);
    expect(sends).toBe(1);
    expect(chat.quiz).toBeNull();
    expect(chat.busy).toBe(false);
    expect(chat.session.state.crisisFired).toBe(true);
    expect(chat.session.state.crisisCategories).toEqual(["self_harm"]);
    chat.session.send = orig;
    await sendToChat(chat, "อยากรู้เรื่องคุมกำเนิด", h);
    const last = [...chat.messages].reverse().find((m) => m.from === "jane");
    expect(last?.banner).toEqual(["self_harm"]);
    expect(last?.offer).not.toBe("none");
    await sendToChat(chat, "อยากคุยกับเจ้าหน้าที่", h);
    expect(h.referralBanners.at(-1)).toEqual(["self_harm"]);
  });

  it("opening a quiz during a delayed 30th send is closed when the hard-cap reply lands", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    for (let i = 0; i < HARD_CAP - 1; i++) await sendToChat(chat, FILLER, h);
    expect(chat.readOnly).toBe(false);
    const orig = chat.session.send.bind(chat.session);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    chat.session.send = async (text) => { await held; return orig(text); };
    const capLine = "อยากรู้เรื่องคุมกำเนิด";
    const pending = sendToChat(chat, capLine, h);
    expect(chat.busy).toBe(true);
    expect(chat.messages.filter((m) => m.from === "user" && m.text === capLine)).toHaveLength(1);
    chat.quiz = startQuiz(chat.session.state.ageBand, "contraception");
    expect(chat.quiz).not.toBeNull();
    release();
    await pending;
    expect(chat.busy).toBe(false);
    expect(chat.readOnly).toBe(true);
    expect(chat.quiz).toBeNull();
    expect(chat.messages.filter((m) => m.from === "user" && m.text === capLine)).toHaveLength(1);
    const last = [...chat.messages].reverse().find((m) => m.from === "jane");
    expect(last?.cap === "hard" || last?.note === "readonly").toBe(true);
    expect(last?.offer && last.offer !== "none").toBe(true);
    applyQuizUpdate(chat, startQuiz(chat.session.state.ageBand, "contraception"), h);
    expect(chat.quiz).toBeNull();
  });

  it("beginQuiz is a no-op while a reply is pending", async () => {
    const chat = newChat("15-17", null);
    const h = hooks();
    let renders = 0;
    h.rerender = () => { renders++; };
    await sendToChat(chat, "ใช้ถุงยาง", h);
    const orig = chat.session.send.bind(chat.session);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    chat.session.send = async (text) => { await held; return orig(text); };
    const pending = sendToChat(chat, FILLER, h);
    expect(chat.busy).toBe(true);
    const before = renders;
    beginQuiz(chat, "contraception", h);
    expect(chat.quiz).toBeNull();
    expect(renders).toBe(before);
    release();
    await pending;
    expect(chat.busy).toBe(false);
    expect(chat.quiz).toBeNull();
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
