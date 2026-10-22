import { describe, it, expect, vi } from "vitest";
import { toDialogModel } from "../../src/llm/dialogModel";
import { parsePick, pickSchema, pickUser, cleanReword, rewordUser, NONE_ID, REWORD_MAX_TOKENS } from "../../src/llm/prompts";
import { REWORD_RUNTIMES } from "../../src/config";
import type { LLMAdapter } from "../../src/llm/adapter";

// SYNTHETIC strings only.
const ids = ["ec.p000", "pregnancy.p000"];
const fake = (runtime: "webgpu" | "wasm" | undefined, extra: Partial<LLMAdapter> = {}): LLMAdapter => ({
  name: "fake", runtime, ready: () => true, classify: async () => null, polishSummary: async () => null,
  pickCard: vi.fn(async () => '{"id":"ec.p000"}'), rewordCard: vi.fn(async () => "ข้อความทดสอบ"), ...extra,
});

describe("pick prompt and parser", () => {
  it("accepts only shortlist ids", () => {
    expect(parsePick('{"id":"ec.p000"}', ids)).toBe("ec.p000");
    expect(parsePick('<think>hm</think>{"id": "pregnancy.p000"}', ids)).toBe("pregnancy.p000");
    expect(parsePick(`{"id":"${NONE_ID}"}`, ids)).toBeNull();
    expect(parsePick('{"id":"sti_hiv.p000"}', ids)).toBeNull();
    expect(parsePick("ec.p000", ids)).toBeNull();
    expect(parsePick("", ids)).toBeNull();
  });
  it("the JSON schema enum is the shortlist plus none", () => expect(pickSchema(ids).properties.id.enum).toEqual([...ids, NONE_ID]));
  it("the pick prompt lists ids and titles", () => {
    const u = pickUser("ทดสอบ", [{ id: "ec.p000", title_th: "ยาคุมฉุกเฉิน" }], "หัวข้อเดิม");
    expect(u).toContain("ec.p000 = ยาคุมฉุกเฉิน"); expect(u).toContain("หัวข้อก่อนหน้า: หัวข้อเดิม");
  });
});

describe("reword prompt helpers", () => {
  it("cleanReword strips thinking, labels and quotes", () => {
    expect(cleanReword('<think>a</think> ข้อความ: "สวัสดีค่ะ"')).toBe("สวัสดีค่ะ");
    expect(cleanReword("<think>only</think>")).toBe("");
  });
  it("the reword prompt carries the card text and key facts only", () => {
    expect(rewordUser({ answer_th: "ข้อความทดสอบ", key_facts: ["เภสัชกร"] })).toBe("ข้อมูลที่ต้องคงไว้: เภสัชกร\nข้อความ: ข้อความทดสอบ");
  });
  it("reword output is capped at 160 tokens", () => expect(REWORD_MAX_TOKENS).toBe(160));
});

describe("toDialogModel bridge", () => {
  it("WASM reword is off by default (measured p90 3.3 s > 3 s); WebGPU reword is on", () => {
    expect(REWORD_RUNTIMES).toEqual(["webgpu"]);
    expect(toDialogModel(fake("wasm"))!.reword).toBeUndefined();
    expect(toDialogModel(fake("wasm"))!.pickCard).toBeTypeOf("function");
    expect(toDialogModel(fake("webgpu"))!.reword).toBeTypeOf("function");
    expect(toDialogModel(fake("wasm"), ["webgpu", "wasm"])!.reword).toBeTypeOf("function");
    expect(toDialogModel(fake(undefined))!.reword).toBeUndefined();
  });
  it("no adapter, or an adapter without chat methods, means no chat model", () => {
    expect(toDialogModel(null)).toBeNull();
    expect(toDialogModel(fake("webgpu", { pickCard: undefined, rewordCard: undefined }))).toBeNull();
  });
  it("pickCard output is parsed against the shortlist", async () => {
    const m = toDialogModel(fake("webgpu", { pickCard: async () => '{"id":"other.x"}' }))!;
    const sig = new AbortController().signal;
    expect(await m.pickCard!("ทดสอบ", ids.map((id) => ({ id, title_th: id })), null, sig)).toBeNull();
    const m2 = toDialogModel(fake("webgpu"))!;
    expect(await m2.pickCard!("ทดสอบ", ids.map((id) => ({ id, title_th: id })), null, sig)).toBe("ec.p000");
  });
  it("reword passes only the card text and key facts to the adapter", async () => {
    const rw = vi.fn(async () => "x");
    const m = toDialogModel(fake("webgpu", { rewordCard: rw }))!;
    await m.reword!({ id: "ec.p000", answer_th: "ก", key_facts: ["ข"], triggers: ["ลับ"] } as any, new AbortController().signal);
    expect((rw.mock.calls[0] as unknown[])[0]).toEqual({ answer_th: "ก", key_facts: ["ข"] });
  });
});
