import { describe, expect, it, vi } from "vitest";
import { ENGLISH_MODEL_CHAT } from "../../src/config";
import { BANK, BANK_FIXTURES } from "../../src/core/bankData";
import { AMBIGUOUS_CRISIS_LINE_TH } from "../../src/core/chat-crisis";
import {
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import type { ChatGrounding } from "../../src/llm/chat-system";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

const SAFE_JSON = STUB_CHAT_REPLY_TH;
const SAFE = STUB_CHAT_REPLY_TH;
const GUARD_FAIL = "กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test";
const HEAT = GUARD_FAIL;
const PARENT = GUARD_FAIL;
const INCOMPLETE = GUARD_FAIL;

function spyModel(reply: string | string[] = SAFE_JSON) {
  const calls = { chat: 0, pick: 0, groundings: [] as Array<ChatGrounding | undefined> };
  const list = Array.isArray(reply) ? reply : null;
  let n = 0;
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async (_t, _h, _s, _lang, _gid, opts) => {
      calls.chat++;
      calls.groundings.push(opts?.grounding);
      if (list) return list[Math.min(n++, list.length - 1)] ?? SAFE_JSON;
      return reply;
    }),
    pickCard: vi.fn(async () => "none"),
  };
  return { model, calls };
}

const deps = (model: DialogModel, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "draft", chatFirst: true, ...extra,
});

describe("chat-first grounding in runTurn", () => {
  it("ENGLISH_MODEL_CHAT stays false", () => {
    expect(ENGLISH_MODEL_CHAT).toBe(false);
  });

  it("does not pass card facts into the first generate", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ถุงยางแตกทำไงดี", deps(model));
    expect(r.reply.kind).toBe("chat");
    expect(calls.chat).toBe(1);
    expect(calls.groundings[0]?.facts).toBeUndefined();
  });

  it("still chats when no card matches well enough", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ขอสูตรเค้กช็อกโกแลตที่ไม่มีในคลัง", deps(model));
    expect(r.reply.kind).toBe("chat");
    expect(calls.groundings[0]?.facts).toBeUndefined();
  });

  it("heat-a-broken-condom retries once strictly then shows the card", async () => {
    const { model, calls } = spyModel(HEAT);
    const r = await runTurn(newDialog(), "ถุงยางแตกทำไงดี", deps(model));
    expect(calls.chat).toBe(2);
    expect(calls.groundings[1]?.strict).toBe(true);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.card.id).toBe("condom.leak.000");
      expect(r.reply.text).toBe(r.reply.card.answer_th);
    }
  });

  it("parent-needed-for-PrEP retries once then shows the card", async () => {
    const { model, calls } = spyModel(PARENT);
    const r = await runTurn(newDialog(), "เพร็พคืออะไร", deps(model));
    expect(calls.chat).toBe(2);
    expect(calls.groundings[1]?.strict).toBe(true);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") expect(r.reply.card.id).toBe("protection.prep.000");
  });

  it("an incomplete reply retries once then shows the card", async () => {
    const { model, calls } = spyModel(INCOMPLETE);
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(calls.chat).toBe(2);
    expect(r.reply.kind).toBe("card");
  });

  it("a particle-only leftover that fails the guard retries once then shows the card", async () => {
    const { model, calls } = spyModel(GUARD_FAIL);
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(calls.chat).toBe(2);
    expect(r.reply.kind).toBe("card");
  });

  it("does not send an 18+ card's answer_th to the model when age is unverified or under 18", async () => {
    const cards = [...BANK, ...BANK_FIXTURES];
    const adultAnswer = BANK_FIXTURES.find((c) => c.id === "other.adult_only.000")!.answer_th;
    for (const band of ["15-17", "unspecified", null] as const) {
      const { model, calls } = spyModel();
      await runTurn(newDialog(band), "เนื้อหาทดสอบสิบแปดบวก", deps(model, { cards }));
      expect(calls.chat).toBeGreaterThan(0);
      for (const g of calls.groundings) {
        expect(g?.facts ?? null, String(band)).not.toBe(adultAnswer);
        expect(g?.facts ?? "", String(band)).not.toContain("ข้อความทดสอบสำหรับอายุ 18 ปีขึ้นไปเท่านั้น");
      }
    }
    const { model, calls } = spyModel();
    await runTurn(newDialog("18-24"), "เนื้อหาทดสอบสิบแปดบวก", deps(model, { cards }));
    expect(calls.groundings[0]?.facts).toBeUndefined();
  });

  it("invalid then a valid free-text reply keeps the second reply", async () => {
    const { model, calls } = spyModel([INCOMPLETE, SAFE_JSON]);
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(calls.chat).toBe(2);
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind === "chat") expect(r.reply.text).toBe(SAFE);
  });

  it("a mid-word cut-off is invalid, retries once, then shows the card", async () => {
    const { model, calls } = spyModel(GUARD_FAIL);
    const r = await runTurn(newDialog(), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
    expect(calls.chat).toBe(2);
    expect(r.reply.kind).toBe("card");
  });

  it("CLEAR crisis still makes 0 model calls", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "ตอนนี้อยากตายมาก", deps(model));
    expect(r.reply.kind).toBe("crisis");
    expect(calls.chat).toBe(0);
  });

  it("AMBIGUOUS is the bank card plus the DRAFT soft line and never calls the model", async () => {
    const { model, calls } = spyModel();
    const r = await runTurn(newDialog(), "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง", deps(model));
    expect(calls.chat).toBe(0);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.softCrisis?.line).toBe(AMBIGUOUS_CRISIS_LINE_TH);
      expect(r.reply.card.id).toBeTruthy();
    }
  });

  it("AMBIGUOUS discards a mocked model reply and still never calls the model", async () => {
    const { model, calls } = spyModel([INCOMPLETE, SAFE_JSON]);
    const r = await runTurn(newDialog(), "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง", deps(model));
    expect(calls.chat).toBe(0);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.softCrisis?.line).toBe(AMBIGUOUS_CRISIS_LINE_TH);
    }
  });

  it("AMBIGUOUS with a topic question is still the card plus the DRAFT soft line, 0 calls", async () => {
    const { model, calls } = spyModel(HEAT);
    const r = await runTurn(newDialog(), "หนูสิ้นหวังมาก ถุงยางแตกทำไงดี", deps(model));
    expect(calls.chat).toBe(0);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.softCrisis?.line).toBe(AMBIGUOUS_CRISIS_LINE_TH);
    }
  });
});
