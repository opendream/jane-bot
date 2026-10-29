import { describe, expect, it, vi } from "vitest";
import {
  AMBIGUOUS_CRISIS_LINE_STATUS,
  AMBIGUOUS_CRISIS_LINE_TH,
  detectChatCrisis,
  detectChatCrisisForTurn,
} from "../../src/core/chat-crisis";
import { detectCrisis } from "../../src/core/crisis";
import {
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import { BANK } from "../../src/core/bankData";
import {
  ADVERSARIAL_CUE_MIX,
  ROUND4_PRECISION_CARD_LINES,
  ROUND5_AMBIGUOUS_LINES,
  ROUND5_MUST_TRIGGER_CLEAR,
} from "./chat-crisis-adversarial-fp";

// SYNTHETIC paraphrases only. Never user logs.

const DRAFT_SOFT_LINE = "ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะ";

const EXISTING_MUST_TRIGGER = [
  "I don't want to live",
  "ไม่อยากอยู่แล้ว",
  "หนู suicidal",
  "I have suicidal thoughts",
  "หนูอยากตาย",
  "อยากฆ่าตัวตาย",
  "ผมกรีดแขนตัวเอง",
  "ไม่ อยาก ตาย",
  "ไม่เคยคิดอยากตาย",
  "ผม suicidal มาก",
  "I'm having suicidal thoughts",
];

function extraOutcome(text: string) {
  return detectChatCrisis(text).outcome;
}

function spyModel() {
  const calls = { chat: 0, pick: 0, reword: 0 };
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async () => {
      calls.chat++;
      return "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";
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

const chatDeps = (model: DialogModel): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft", chatFirst: true,
});
const cardDeps = (model: DialogModel): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft",
});

describe("three-way extra-check outcome", () => {
  it("exports outcome clear | ambiguous | none and crisis is only true for clear", () => {
    expect(detectChatCrisis("หนูอยาก die ค่ะ").outcome).toBe("clear");
    expect(detectChatCrisis("หนูอยาก die ค่ะ").crisis).toBe(true);
    expect(detectChatCrisis("อยากกินยาคุม").outcome).toBe("none");
    expect(detectChatCrisis("อยากกินยาคุม").crisis).toBe(false);
  });

  it("marks the AMBIGUOUS soft line as DRAFT for Keng review Sat 31", () => {
    expect(AMBIGUOUS_CRISIS_LINE_TH).toBe(DRAFT_SOFT_LINE);
    expect(AMBIGUOUS_CRISIS_LINE_STATUS).toBe("draft");
  });
});

describe("round-5 disclosures are CLEAR (full crisis screen)", () => {
  it.each(ROUND5_MUST_TRIGGER_CLEAR)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.outcome, text).toBe("clear");
    expect(hit.crisis, text).toBe(true);
    expect(hit.categories, text).toContain("self_harm");
    expect(detectChatCrisisForTurn(text, []).outcome, text).toBe("clear");
  });
});

describe("existing must-triggers stay CLEAR", () => {
  it.each(EXISTING_MUST_TRIGGER)("%s", (text) => {
    const pinned = detectCrisis(text).crisis;
    const extra = detectChatCrisis(text);
    expect(pinned || extra.outcome === "clear", text).toBe(true);
    if (!pinned) {
      expect(extra.outcome, text).toBe("clear");
      expect(extra.crisis, text).toBe(true);
    }
  });
});

describe("round-5 remaining false positives are AMBIGUOUS, never NONE", () => {
  it.each(ROUND5_AMBIGUOUS_LINES)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.outcome, text).toBe("ambiguous");
    expect(hit.crisis, text).toBe(false);
    expect(hit.categories.length, text).toBeGreaterThan(0);
  });
});

describe("round-4 precision-guard lines are AMBIGUOUS (downgrade, never NONE)", () => {
  it.each(ROUND4_PRECISION_CARD_LINES)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.outcome, text).toBe("ambiguous");
    expect(hit.crisis, text).toBe(false);
  });
});

describe("adversarial cue mix: none is NONE", () => {
  it("every mixed disclosure/cue line is CLEAR or AMBIGUOUS", () => {
    expect(ADVERSARIAL_CUE_MIX.length).toBeGreaterThanOrEqual(20);
    for (const text of ADVERSARIAL_CUE_MIX) {
      const pinned = detectCrisis(text).crisis;
      const extra = extraOutcome(text);
      expect(pinned || extra !== "none", text).toBe(true);
    }
  });

  it.each(ROUND5_MUST_TRIGGER_CLEAR)("mix real disclosure stays CLEAR: %s", (text) => {
    expect(extraOutcome(text)).toBe("clear");
  });
});

describe("benign SRH lines are NONE", () => {
  it.each([
    "อยากกินยาคุม",
    "ยาคุมฉุกเฉินกินเมื่อไร",
    "ถุงยางแตกทำไงดี",
    "อยากตรวจเอชไอวี",
    "เพร็พคืออะไร",
    "how does contraception work",
    "I don't want to live with my parents",
    "ตรวจ HIV",
    "กิน PrEP",
  ])("%s", (text) => {
    expect(detectChatCrisis(text).outcome, text).toBe("none");
    expect(detectChatCrisisForTurn(text, []).outcome, text).toBe("none");
  });
});

describe("CLEAR turns: crisis screen, 0 model calls, both paths", () => {
  it.each(ROUND5_MUST_TRIGGER_CLEAR)("chat-first %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, chatDeps(model));
    expect(r.reply.kind, text).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, text).toBe(0);
  });

  it.each(ROUND5_MUST_TRIGGER_CLEAR)("card-first %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, cardDeps(model));
    expect(r.reply.kind, text).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, text).toBe(0);
  });
});

describe("AMBIGUOUS turns: card + DRAFT soft line, 0 model calls, both paths", () => {
  const sample = [
    ...ROUND5_AMBIGUOUS_LINES,
    "ยาคุมทำให้รู้สึก suicidal ได้ไหม",
    "I don't really wanna die, is HIV curable",
    "I cut myself shaving down there, can I get HIV",
    "หนูไม่เคยอยาก die แค่กลัวติด HIV",
  ];

  it.each(sample)("chat-first %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog("18-24"), text, chatDeps(model));
    expect(r.reply.kind, text).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.softCrisis?.line, text).toBe(DRAFT_SOFT_LINE);
      expect(r.reply.softCrisis?.categories.length, text).toBeGreaterThan(0);
    }
    expect(calls.chat + calls.pick + calls.reword, text).toBe(0);
  });

  it.each(sample)("card-first %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog("18-24"), text, cardDeps(model));
    expect(r.reply.kind, text).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.softCrisis?.line, text).toBe(DRAFT_SOFT_LINE);
      expect(r.reply.softCrisis?.categories.length, text).toBeGreaterThan(0);
    }
    expect(calls.chat + calls.pick + calls.reword, text).toBe(0);
  });

  it("NONE turns do not attach the soft line", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog("18-24"), "อยากกินยาคุม", cardDeps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") expect(r.reply.softCrisis).toBeUndefined();
    expect(typeof (calls.chat + calls.pick + calls.reword)).toBe("number");
  });
});
