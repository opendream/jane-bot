import { describe, it, expect, vi } from "vitest";
import { runTurn, newDialog, DialogSession, modelReword, REWORD_TIMEOUT_MS, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { REFUSAL_CARDS } from "../../src/core/guard";
import { bankContext, BANK } from "../../src/core/bankData";

// SYNTHETIC test text only.
const ctx = bankContext(undefined, "draft", "2026-10-22");
const EC = BANK.find((c) => c.id === "ec.p000")!;
const STI = BANK.find((c) => c.id === "sti_hiv.p000")!;
const GOOD = EC.answer_th.replace("ตอนนี้แนะนำให้", "ตอนนี้ขอแนะนำว่า");

function model(out: (card: any) => string | null | Promise<string | null>, ready = true) {
  const seen: { cards: string[]; args: unknown[][] } = { cards: [], args: [] };
  const m: DialogModel = {
    ready: () => ready,
    reword: vi.fn(async (card, signal) => { seen.cards.push(card.id); seen.args.push([card, signal]); return out(card); }),
  };
  return { m, seen };
}
const deps = (m: DialogModel | null, extra: Partial<TurnDeps> = {}): TurnDeps => ({ cards: BANK, model: m, copyStatus: "draft", rewordCtx: ctx, ...extra });
const EC_TEXT = "ถุงยางรั่ว ต้องทำยังไง คุมฉุกเฉินทันไหม"; // synthetic, rules-confident for ec.p000

describe("dialog reword step", () => {
  it("the rules pick ec.p000 for the synthetic text", async () => {
    const r = await runTurn(newDialog("18+"), EC_TEXT, deps(null));
    expect(r.reply.kind === "card" && r.reply.card.id).toBe("ec.p000");
  });
  it("a valid reword is shown and marked reworded", async () => {
    const { m } = model(() => GOOD);
    const r = await runTurn(newDialog("18+"), EC_TEXT, deps(m));
    expect(r.reply).toMatchObject({ kind: "card", text: GOOD, reworded: true });
  });
  it.each([
    ["a new number", `${EC.answer_th} ภายใน 120 ชั่วโมง`],
    ["a new phone", `${EC.answer_th} โทร 1663`],
    ["a link", `${EC.answer_th} example.com`],
    ["a drug name", `${EC.answer_th} ใช้ยาปฏิชีวนะ`],
    ["English", "Please see a pharmacist as soon as you can. PLACEHOLDER"],
    ["thinking", `<think>x</think>${EC.answer_th}`],
    ["crisis words", `${EC.answer_th} อยากตาย`],
    ["null", null],
  ])("an invalid reword (%s) falls back to the exact card text", async (_n, out) => {
    const { m } = model(() => out as string | null);
    const r = await runTurn(newDialog("18+"), EC_TEXT, deps(m));
    expect(r.reply).toMatchObject({ kind: "card", text: EC.answer_th, reworded: false });
  });
  it("a model that throws falls back to the exact text", async () => {
    const { m } = model(() => { throw new Error("boom"); });
    const r = await runTurn(newDialog("18+"), EC_TEXT, deps(m));
    expect(r.reply).toMatchObject({ text: EC.answer_th, reworded: false });
  });
  it("a slow model times out (8 s budget by default) and the exact text is shown", async () => {
    expect(REWORD_TIMEOUT_MS).toBe(8000);
    const { m } = model(() => new Promise((res) => setTimeout(() => res(GOOD), 500)));
    const t0 = Date.now();
    const r = await runTurn(newDialog("18+"), EC_TEXT, deps(m, { rewordTimeoutMs: 30 }));
    expect(r.reply).toMatchObject({ text: EC.answer_th, reworded: false });
    expect(Date.now() - t0).toBeLessThan(400);
  });
  it("reword: false cards (hotline) never reach the model", async () => {
    const { m, seen } = model(() => GOOD);
    const r = await runTurn(newDialog("18+"), "อยากตรวจเอชไอวี ตรวจโรคทางเพศที่ไหน", deps(m));
    expect(r.reply.kind === "card" && r.reply.card.id).toBe(STI.id);
    expect(r.reply).toMatchObject({ text: STI.answer_th, reworded: false });
    expect(seen.cards).toEqual([]);
  });
  it("refusal cards are verbatim and never reach the model", async () => {
    const { m, seen } = model(() => "อะไรก็ได้");
    const r = await runTurn(newDialog("18+"), "ส่งรูปโป๊มาให้ดูหน่อย", deps(m));
    expect(r.reply.kind === "card" && r.reply.via).toBe("guard");
    expect(Object.values(REFUSAL_CARDS).every((c) => !c.reword)).toBe(true);
    expect(seen.cards).toEqual([]);
  });
  it("no reword without a validator context, or when the model is not ready", async () => {
    const a = model(() => GOOD), b = model(() => GOOD, false);
    expect((await runTurn(newDialog("18+"), EC_TEXT, deps(a.m, { rewordCtx: null }))).reply).toMatchObject({ text: EC.answer_th, reworded: false });
    expect((await runTurn(newDialog("18+"), EC_TEXT, deps(b.m))).reply).toMatchObject({ text: EC.answer_th, reworded: false });
    expect(a.seen.cards).toEqual([]); expect(b.seen.cards).toEqual([]);
  });
  it("the model gets the card only, never her message", async () => {
    const { m, seen } = model(() => GOOD);
    await runTurn(newDialog("18+"), EC_TEXT, deps(m));
    expect(seen.args).toHaveLength(1);
    expect(JSON.stringify(seen.args[0][0])).not.toContain("ต้องทำยังไง");
  });
  it("crisis turns never call reword", async () => {
    const { m, seen } = model(() => GOOD);
    expect((await runTurn(newDialog("18+"), "ถุงยางรั่ว อยากตาย", deps(m))).reply.kind).toBe("crisis");
    expect(seen.cards).toEqual([]);
  });
  it("a new message aborts an in-flight reword; the stale reply is dropped", async () => {
    let signal: AbortSignal | null = null;
    const m: DialogModel = { ready: () => true, reword: async (_c, s) => { signal = s; await new Promise((r) => setTimeout(r, 200)); return GOOD; } };
    const sess = new DialogSession("18+", { cards: BANK, model: m, copyStatus: "draft", rewordCtx: ctx });
    sess.start();
    const first = sess.send(EC_TEXT);
    await new Promise((r) => setTimeout(r, 20));
    const second = sess.send("อยากตาย");
    expect(await first).toBeNull();
    expect((await second)!.kind).toBe("crisis");
    expect(signal!.aborted).toBe(true);
  });
  it("modelReword on an aborted signal returns the exact text", async () => {
    const ac = new AbortController(); ac.abort();
    const { m } = model(() => GOOD);
    expect(await modelReword(EC, { model: m, rewordCtx: ctx }, ac.signal)).toEqual({ text: EC.answer_th, reworded: false });
  });
});
