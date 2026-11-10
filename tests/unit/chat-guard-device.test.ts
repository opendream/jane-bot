import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { acceptChatReply, chatGuardFailures, normaliseChatReply } from "../../src/llm/chatGuard";

// SYNTHETIC strings only — never real names, phones, or clinical claims.

const deps = (model: DialogModel): TurnDeps => ({
  cards: BANK, model, copyStatus: "reviewed", chatFirst: true,
});

async function runAsJane(line: string) {
  const model: DialogModel = {
    ready: () => true,
    chatReply: vi.fn(async () => line),
  };
  const r = await runTurn(newDialog("18-24"), "ช่วงนี้กังวลเรื่องแฟน", deps(model));
  return r;
}

describe("device fix: 0.6B Thai replies with digits, doses, loanwords, stray CJK", () => {
  const PERIOD = "ประจำเดือนมาช้า 3-7 วันถือว่าปกติได้นะ";
  const WAIT = "รอผลประมาณ 21 วันได้นะ พี่อยู่ตรงนี้";
  const DOSE = "กิน 1 เม็ดภายใน 72 ชั่วโมง";
  const PREP = "เธอใช้ PrEP ได้เลยนะคะ เราฟังอยู่ค่ะ";
  const CJK_RAW = "พี่อยู่ตรงนี้นะ 你好 น้องเล่าเพิ่มได้เลย";
  const CJK_CLEAN = "พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย";

  it.each([
    ["period delay 3-7 days", PERIOD, PERIOD],
    ["21 days", WAIT, WAIT],
    ["dose with digits", DOSE, DOSE],
    ["PrEP loanword", PREP, PREP],
    ["stray Chinese stripped", CJK_RAW, CJK_CLEAN],
  ] as const)("accepts %s (ok=true) and runTurn renders it as Jane", async (_name, raw, shown) => {
    expect(normaliseChatReply(raw)).toBe(shown);
    expect(chatGuardFailures(raw)).toEqual([]);
    expect(acceptChatReply(raw)).toEqual({ ok: true, text: shown });

    const r = await runAsJane(raw);
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.text).toBe(shown);
    expect(r.reply.card).toBeNull();
  });

  it("strips CJK and does not leave the Chinese characters in the Jane reply", () => {
    const acc = acceptChatReply(CJK_RAW);
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    expect(acc.text).toBe(CJK_CLEAN);
    expect(acc.text).not.toMatch(/[\u3400-\u9FFF]/);
  });
});

describe("device fix: still reject invented phones and non-Thai replies", () => {
  it.each([
    ["landline with dashes", "โทร 02-123-4567 ได้เลยนะ พี่อยู่ตรงนี้"],
    ["compact mobile", "โทร 0812345678 ได้เลยนะ พี่อยู่ตรงนี้"],
    ["international spaced", "โทร +66 81 234 5678 ได้เลยนะ พี่อยู่ตรงนี้"],
  ] as const)("rejects a Thai reply containing a phone number (%s)", (_name, line) => {
    expect(acceptChatReply(line).ok).toBe(false);
    expect(chatGuardFailures(line)).toContain("phone");
    expect(chatGuardFailures(line)).not.toContain("digits");
  });

  it("rejects a fully Chinese reply in a Thai session", () => {
    const line = "这是一个完全中文的回复。";
    expect(acceptChatReply(line).ok).toBe(false);
  });

  it("rejects a fully English reply in a Thai session", () => {
    const line = "Sure I can help you with that today";
    expect(acceptChatReply(line).ok).toBe(false);
    expect(chatGuardFailures(line)).toContain("script");
  });
});
