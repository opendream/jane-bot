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

function extraOrPinnedClear(text: string): boolean {
  if (detectCrisis(text).crisis) return true;
  return detectChatCrisis(text).outcome === "clear";
}

const CODEX_R6_SIDE_EFFECT_STAYS_CLEAR = [
  "ตรวจแล้วติด HIV หนูรู้สึก suicidal ควรบอกแม่ไหม",
  "เลิกกับแฟนแล้วหนูรู้สึก suicidal จะไหวไหม",
  "ผลตรวจออกแล้ว หนูรู้สึก suicidal ไม่รู้จะอยู่ต่อไหวไหม",
  "เลิกกับแฟนแล้ว หนูรู้สึก suicidal มีคนเข้าใจหนูไหม",
] as const;

const CODEX_R6_NO_SPACE_STAYS_CLEAR = [
  "ยาคุมมีผลข้างเคียงไหมหนูรู้สึก suicidal จริงๆ",
  "ยาคุมมีผลข้างเคียงหนูรู้สึก suicidal มาก",
] as const;

const CODEX_R6_NEGATION_STAYS_CLEAR = [
  "ทนไม่ได้ อยาก die",
  "หนูทนไม่ได้อยาก die ค่ะ",
  "หนูนอนไม่ได้ รู้สึก suicidal ทุกคืน",
] as const;

const CODEX_R6_ACCIDENT_STAYS_CLEAR = [
  "หนู cut ตัวเองด้วยมีดโกนที่ใช้โกนขนทุกคืน",
] as const;

const TRUE_AMBIGUOUS_MUST_HOLD = [
  "หนูไม่ค่อยอยาก die นะ แค่ถามเรื่อง HIV",
  "หนูไม่เคยคิดอยาก die แค่กลัวติด HIV",
  "กินยาคุมแล้วรู้สึก suicidal เป็นผลข้างเคียงไหม",
  "กินยาคุมแล้วรู้สึก suicidal ปกติไหม",
  "I don't want to live in fear of HIV, should I take PrEP",
  "I don’t want to live in fear of HIV",
  "I don't want to live together before marriage, is sex ok",
] as const;

const CODEX_R6_MUST_TRIGGER_CLEAR = [
  ...CODEX_R6_SIDE_EFFECT_STAYS_CLEAR,
  ...CODEX_R6_NO_SPACE_STAYS_CLEAR,
  ...CODEX_R6_NEGATION_STAYS_CLEAR,
  ...CODEX_R6_ACCIDENT_STAYS_CLEAR,
] as const;

describe("Codex round-6: loose แล้ว…ไหม is not a side-effect question (CLEAR)", () => {
  it.each(CODEX_R6_SIDE_EFFECT_STAYS_CLEAR)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).outcome, text).toBe("clear");
    expect(detectChatCrisisForTurn(text, []).outcome, text).toBe("clear");
  });
});

describe("Codex round-6: no-space clause split keeps a later disclosure CLEAR", () => {
  it.each(CODEX_R6_NO_SPACE_STAYS_CLEAR)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).outcome, text).toBe("clear");
  });
});

describe("Codex round-6: trailing ไม่ได้ on another verb is not negation (CLEAR)", () => {
  it.each(CODEX_R6_NEGATION_STAYS_CLEAR)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).outcome, text).toBe("clear");
  });
});

describe("Codex round-6: reflexive self-cut naming the razor stays CLEAR", () => {
  it.each(CODEX_R6_ACCIDENT_STAYS_CLEAR)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).outcome, text).toBe("clear");
  });
});

describe("Codex round-6 CLEAR turns: crisis screen, 0 model calls, both paths", () => {
  it.each(CODEX_R6_MUST_TRIGGER_CLEAR)("chat-first %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, chatDeps(model));
    expect(r.reply.kind, text).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, text).toBe(0);
  });

  it.each(CODEX_R6_MUST_TRIGGER_CLEAR)("card-first %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, cardDeps(model));
    expect(r.reply.kind, text).toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword, text).toBe(0);
  });
});

describe("true ambiguous cases stay AMBIGUOUS, never NONE", () => {
  it.each(TRUE_AMBIGUOUS_MUST_HOLD)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).outcome, text).toBe("ambiguous");
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
});

describe("AMBIGUOUS is current-turn only; the window may only escalate to CLEAR", () => {
  const first = "หนูไม่ค่อยอยาก die นะ แค่ถามเรื่อง HIV";
  const second = "ถุงยางราคาเท่าไหร่";
  const third = "PrEP กินยังไง";

  it("detector: later unrelated lines are NONE even with the AMBIGUOUS line in prev", () => {
    expect(detectChatCrisis(first).outcome).toBe("ambiguous");
    expect(detectChatCrisisForTurn(first, []).outcome).toBe("ambiguous");
    expect(detectChatCrisisForTurn(second, [first]).outcome).toBe("none");
    expect(detectChatCrisisForTurn(third, [first, second]).outcome).toBe("none");
    expect(detectChatCrisisForTurn("หนูอยาก die ค่ะ", [first]).outcome).toBe("clear");
  });

  it("card-first: later unrelated turns have no soft line", async () => {
    const { model, calls } = spyModel();
    const a = await runTurn(newDialog("18-24"), first, cardDeps(model));
    expect(a.reply.kind).toBe("card");
    if (a.reply.kind === "card") expect(a.reply.softCrisis?.line).toBe(DRAFT_SOFT_LINE);
    expect(calls.chat + calls.pick + calls.reword).toBe(0);

    const b = await runTurn(a.state, second, cardDeps(model));
    expect(b.reply.kind).toBe("card");
    if (b.reply.kind === "card") expect(b.reply.softCrisis).toBeUndefined();

    const c = await runTurn(b.state, third, cardDeps(model));
    expect(c.reply.kind).toBe("card");
    if (c.reply.kind === "card") expect(c.reply.softCrisis).toBeUndefined();
  });

  it("chat-first: later unrelated turns have no soft line and call the model", async () => {
    const { model, calls } = spyModel();
    const a = await runTurn(newDialog("18-24"), first, chatDeps(model));
    expect(a.reply.kind).toBe("card");
    if (a.reply.kind === "card") expect(a.reply.softCrisis?.line).toBe(DRAFT_SOFT_LINE);
    expect(calls.chat + calls.pick + calls.reword).toBe(0);

    const afterFirst = calls.chat + calls.pick + calls.reword;
    const b = await runTurn(a.state, second, chatDeps(model));
    expect(b.reply.kind).not.toBe("crisis");
    if (b.reply.kind === "card") expect(b.reply.softCrisis).toBeUndefined();
    if (b.reply.kind === "chat") expect(b.reply).not.toHaveProperty("softCrisis");
    expect(calls.chat + calls.pick + calls.reword).toBeGreaterThan(afterFirst);

    const afterSecond = calls.chat + calls.pick + calls.reword;
    const c = await runTurn(b.state, third, chatDeps(model));
    expect(c.reply.kind).not.toBe("crisis");
    if (c.reply.kind === "card") expect(c.reply.softCrisis).toBeUndefined();
    if (c.reply.kind === "chat") expect(c.reply).not.toHaveProperty("softCrisis");
    expect(calls.chat + calls.pick + calls.reword).toBeGreaterThan(afterSecond);
  });
});

describe("AMBIGUOUS plus a staff request is the referral card plus the soft line", () => {
  it.each(["card-first", "chat-first"] as const)("%s", async (path) => {
    const { model, calls } = spyModel();
    const deps = path === "chat-first" ? chatDeps(model) : cardDeps(model);
    const none = await runTurn(newDialog("18-24"), "อยากคุยกับเจ้าหน้าที่", deps);
    expect(none.reply.kind).toBe("referral");
    if (none.reply.kind === "referral") expect(none.reply.softCrisis).toBeUndefined();

    const r = await runTurn(newDialog("18-24"), "หนูไม่ค่อยอยาก die อยากคุยกับเจ้าหน้าที่", deps);
    expect(r.reply.kind).toBe("referral");
    if (r.reply.kind === "referral") {
      expect(r.reply.softCrisis?.line).toBe(DRAFT_SOFT_LINE);
      expect(r.reply.softCrisis?.categories.length).toBeGreaterThan(0);
    }
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });
});

describe("generated robustness: CLEAR disclosures stay CLEAR with innocent prefixes and suffixes", () => {
  const prefixes = [
    "ตรวจแล้วติด HIV",
    "เลิกกับแฟนแล้ว",
    "ยาคุมมีผลข้างเคียงไหม",
    "ทนไม่ได้",
    "นอนไม่ได้",
  ];
  const suffixes = [
    "จะไหวไหม",
    "เข้าใจหนูไหม",
    "ควรบอกแม่ไหม",
    "มีใครช่วยได้ไหม",
    "ที่ใช้โกนขน",
    "ค่ะ",
    "จริงๆ",
  ];
  const disclosures = [
    ...ROUND5_MUST_TRIGGER_CLEAR,
    "I don't want to live",
    "ไม่อยากอยู่แล้ว",
    "หนู suicidal",
    "I have suicidal thoughts",
  ];

  it("every prefix/suffix combination, with and without spaces, stays CLEAR (never AMBIGUOUS, never NONE unless pinned)", () => {
    const failures: string[] = [];
    const latinGlue = (a: string, b: string) => /[A-Za-z0-9]$/.test(a) && /^[A-Za-z]/.test(b);
    for (const d of disclosures) {
      for (const join of ["", " "] as const) {
        for (const p of prefixes) {
          if (join === "" && latinGlue(p, d)) continue;
          const text = `${p}${join}${d}`;
          if (!extraOrPinnedClear(text)) failures.push(`prefix ${JSON.stringify(text)}`);
        }
        for (const s of suffixes) {
          if (join === "" && latinGlue(d, s)) continue;
          const text = `${d}${join}${s}`;
          if (!extraOrPinnedClear(text)) failures.push(`suffix ${JSON.stringify(text)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
