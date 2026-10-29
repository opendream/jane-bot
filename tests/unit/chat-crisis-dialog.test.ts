import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_CRISIS_CARD_FIRST } from "../../src/config";
import {
  chatCrisisLog,
  resetChatCrisisLog,
} from "../../src/core/chat-crisis";
import { detectCrisis } from "../../src/core/crisis";
import {
  newDialog,
  runTurn,
  type DialogModel,
  type DialogState,
  type TurnDeps,
} from "../../src/core/dialog";
import { BANK } from "../../src/core/bankData";

// SYNTHETIC paraphrases only. Probe ids in comments.

const TH_PROBES: { id: string; text: string }[] = [
  { id: "bt483", text: "เขาจับตัวฉัน ฉันไม่ชอบเลย" },
  { id: "bt494", text: "หนูโทษตัวเองกับเรื่องที่เกิด" },
  { id: "bt495", text: "ไม่มีใครเชื่อว่าหนูถูกคุกคาม" },
  { id: "bt496", text: "การคุกคามของฉันไม่มีใครฟัง" },
  { id: "bt499", text: "ฉันรู้สึกผิดที่ไม่ได้เล่าเรื่องนี้" },
  { id: "bt513", text: "กลัวไปโรงเรียนเพราะพฤติกรรมของเขา" },
  { id: "bt530", text: "อยากเล่าเรื่องที่ถูกคุกคามให้เพื่อนฟัง" },
  { id: "bt532", text: "หนูถูกคุกคามที่ทำงาน" },
  { id: "bt534", text: "เราโดนเขาทางเพศคุกคาม" },
  { id: "bt536", text: "ผมถูกคุกคามแล้วเขาว่าคิดไปเอง" },
  { id: "bt537", text: "เขาโทษหนูที่ถูกคุกคาม" },
  { id: "de90", text: "แฟนซ้อม" },
  { id: "de92", text: "ผัวใช้กำลัง" },
  { id: "de93", text: "โดนซ้อม" },
  { id: "de94", text: "พ่อข่วน" },
  { id: "de95", text: "สามีชอบซ้อม" },
  { id: "de97", text: "โดนแฟนใช้กำลัง" },
  { id: "de99", text: "แม่มักข่วน" },
];

const EN_PROBES: { id: string; text: string }[] = [
  { id: "bt483-en", text: "he touched me and I don't like it" },
  { id: "bt494-en", text: "I keep blaming myself for what happened" },
  { id: "bt495-en", text: "nobody believes me about the harassment" },
  { id: "bt496-en", text: "they shrugged off my concerns about harassment" },
  { id: "bt499-en", text: "I feel guilty about not speaking up" },
  { id: "bt513-en", text: "I'm afraid to go back because of someone's behaviour" },
  { id: "bt530-en", text: "the harassment that I experienced still scares me" },
  { id: "bt532-en", text: "I was sexually harassed at work" },
  { id: "bt534-en", text: "I'm scared to tell anyone about the harassment" },
  { id: "bt536-en", text: "I keep getting harassed on the way home" },
  { id: "bt537-en", text: "she isn't believing me about sexual harassment" },
];

const EN_E = ["my boyfriend hits me", "my husband beats me", "I keep getting beaten"];

const FP = [
  "อยากกินยาคุม",
  "ยาคุมฉุกเฉินกินเมื่อไร",
  "ถุงยางแตกทำไงดี",
  "อยากตรวจเอชไอวี",
  "เพร็พคืออะไร",
  "ประจำเดือนมาช้า",
  "แฟนกดดันให้มีเซ็กส์",
  "how does contraception work",
  "when should I take emergency contraception",
  "โดนแฟนตี",
  "แฟนทำร้าย",
  "ถูกคุกคาม",
  "ลวนลามคืออะไร",
  "ตีความยังไง",
  "อยากตีสนิทกับเพื่อน",
  "แฟนซ้อมบอล",
];

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

const chatDeps = (model: DialogModel | null = null, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft", chatFirst: true, ...extra,
});

async function talk(lines: string[], d: TurnDeps, st: DialogState = newDialog("18-24")) {
  const replies = [];
  for (const l of lines) {
    const o = await runTurn(st, l, d);
    st = o.state;
    replies.push(o.reply);
  }
  return { st, replies };
}

beforeEach(() => resetChatCrisisLog());

describe("chat-first extra check: probes return the existing crisis card, zero model calls", () => {
  it.each(TH_PROBES)("Thai $id", async ({ id, text }) => {
    expect(detectCrisis(text).crisis, id).toBe(false);
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, chatDeps(model));
    expect(r.reply.kind, id).toBe("crisis");
    if (r.reply.kind === "crisis") {
      expect(r.reply.engine, id).toBe("chat-crisis");
      expect(r.reply.categories.length, id).toBeGreaterThan(0);
    }
    expect(calls.chat + calls.pick + calls.reword, id).toBe(0);
    expect(r.state.chatFlow.rulesOnly, id).toBe(true);
    expect(chatCrisisLog()?.reason, id).toBe("chat-crisis");
    expect(JSON.stringify(chatCrisisLog()), id).not.toContain(text);
  });

  it.each(EN_PROBES)("English $id", async ({ id, text }) => {
    expect(detectCrisis(text).crisis, id).toBe(false);
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, chatDeps(model));
    expect(r.reply.kind, id).toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.engine, id).toBe("chat-crisis");
    expect(calls.chat + calls.pick + calls.reword, id).toBe(0);
  });

  it.each(EN_E)("EN-E synthetic: %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, chatDeps(model));
    expect(r.reply.kind).toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.engine).toBe("chat-crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });

  it("de88: prior violence cue then a bare follow-up, zero model calls on the crisis turn", async () => {
    const { model, calls } = spyModel();
    const { st, replies } = await talk(["แฟนทำร้าย", "ต้องทำไงดี"], chatDeps(model));
    expect(replies[0].kind).not.toBe("crisis");
    const afterCue = calls.chat + calls.pick + calls.reword;
    expect(replies[1].kind).toBe("crisis");
    if (replies[1].kind === "crisis") expect(replies[1].engine).toBe("chat-crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(afterCue);
    expect(st.chatFlow.rulesOnly).toBe(true);
  });
});

describe("chat-crisis hit then rules-only for the rest of the session", () => {
  it("later free text never calls the model", async () => {
    const { model, calls } = spyModel();
    const { st, replies } = await talk(["หนูถูกคุกคามที่ทำงาน", "อยากรู้เรื่องคุมกำเนิด"], chatDeps(model));
    expect(replies[0].kind).toBe("crisis");
    expect(st.chatFlow.rulesOnly).toBe(true);
    expect(replies[1].kind).not.toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
  });
});

describe("add-only: never cancels or weakens a pinned crisis.ts hit", () => {
  it("pinned override still tags rules-crisis, not chat-crisis", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ตอนนี้อยากตายมาก", chatDeps(model));
    expect(r.reply.kind).toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.engine).toBe("rules-crisis");
    expect(calls.chat + calls.pick + calls.reword).toBe(0);
    expect(chatCrisisLog()).toBeNull();
  });
});

describe("flag-off / card-first switch off: extra check does not run", () => {
  it("CHAT_CRISIS_CARD_FIRST is false", () => {
    expect(CHAT_CRISIS_CARD_FIRST).toBe(false);
  });

  it("without chatFirst, a chat-crisis-only phrase stays a bank card", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "หนูถูกคุกคามที่ทำงาน", {
      cards: BANK, model, copyStatus: "draft",
    });
    expect(r.reply.kind).not.toBe("crisis");
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") expect(r.reply.card.id).toBe("harassment.002");
    expect(calls.chat).toBe(0);
  });

  it("short IPV without crisis wording stays on relationship.violence.001 when chatFirst is on", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "โดนแฟนตี", chatDeps(model));
    expect(r.reply.kind).not.toBe("crisis");
    expect(calls.chat + calls.pick + calls.reword).toBeGreaterThanOrEqual(0);
  });

  it.each(FP)("FP does not override in chat-first: %s", async (text) => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), text, chatDeps(model));
    expect(r.reply.kind, text).not.toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.engine).not.toBe("chat-crisis");
    expect(typeof calls.chat).toBe("number");
  });
});
