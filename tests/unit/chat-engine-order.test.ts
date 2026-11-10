import { afterEach, describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import {
  DialogSession,
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import { createChatRuntime, shouldStartChatWarmup } from "../../src/llm/chat-engine";
import { createExclusiveGenerate } from "../../src/llm/exclusive-generate";
import {
  bumpGenerationToken,
  currentGenerationToken,
  resetGenerationTokenForTests,
  shouldSkipGeneration,
} from "../../src/llm/generation-token";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

afterEach(() => {
  resetGenerationTokenForTests();
});

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(t); reject(new Error("aborted")); };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

describe("shouldStartChatWarmup", () => {
  it("starts chat warm-up only when chat-first is active", () => {
    expect(shouldStartChatWarmup(true)).toBe(true);
    expect(shouldStartChatWarmup(false)).toBe(false);
    expect(shouldStartChatWarmup(undefined)).toBe(false);
  });
});

describe("exclusive generate: no concurrent engine calls", () => {
  it("never runs two generate callbacks at the same time", async () => {
    const ex = createExclusiveGenerate();
    let active = 0;
    let max = 0;
    const job = (ms: number) => ex.run(async () => {
      active += 1;
      max = Math.max(max, active);
      await delay(ms);
      active -= 1;
      return ms;
    });
    const out = await Promise.all([job(30), job(20), job(10)]);
    expect(out).toEqual([30, 20, 10]);
    expect(max).toBe(1);
    expect(ex.concurrent).toBe(0);
  });
});

describe("chat-first vs card-first engine ordering (#49)", () => {
  it("card-first does not start warm-up, so the first classify finishes within its timeout", async () => {
    const rt = createChatRuntime({ chatFirst: false });
    let active = 0;
    let max = 0;
    const track = async (ms: number) => {
      active += 1;
      max = Math.max(max, active);
      await delay(ms);
      active -= 1;
    };
    const warmup = rt.startWarmup(async () => { await track(200); });
    const t0 = Date.now();
    const out = await rt.classifyOrPick(async () => {
      await track(15);
      return "intent";
    });
    expect(out).toBe("intent");
    expect(Date.now() - t0).toBeLessThan(80);
    expect(max).toBe(1);
    await warmup;
  });

  it("chat-first first turn waits for warm-up then generates, with no overlapping calls", async () => {
    const rt = createChatRuntime({ chatFirst: true });
    let active = 0;
    let max = 0;
    const log: string[] = [];
    const track = async (name: string, ms: number) => {
      log.push(`start:${name}`);
      active += 1;
      max = Math.max(max, active);
      await delay(ms);
      active -= 1;
      log.push(`end:${name}`);
    };
    rt.startWarmup(async () => { await track("warmup", 40); });
    const t0 = Date.now();
    const out = await rt.chat(currentGenerationToken(), undefined, async () => {
      await track("chat", 10);
      return STUB_CHAT_REPLY_TH;
    });
    expect(out).toBe(STUB_CHAT_REPLY_TH);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(max).toBe(1);
    expect(log).toEqual(["start:warmup", "end:warmup", "start:chat", "end:chat"]);
  });

  it("classify/pick abort or queue behind an in-flight warm-up so they never overlap", async () => {
    const rt = createChatRuntime({ chatFirst: true });
    let active = 0;
    let max = 0;
    const track = async (ms: number, signal?: AbortSignal) => {
      active += 1;
      max = Math.max(max, active);
      await delay(ms, signal).catch(() => {});
      active -= 1;
    };
    rt.startWarmup(async (s) => { await track(80, s); });
    await delay(5);
    const t0 = Date.now();
    const out = await rt.classifyOrPick(async () => {
      await track(10);
      return "ok";
    });
    expect(out).toBe("ok");
    expect(Date.now() - t0).toBeLessThan(120);
    expect(max).toBe(1);
  });
});

describe("card-first DialogSession bumps the generation token (#49)", () => {
  it("a card-first first turn invalidates an in-flight warm-up group", async () => {
    const warmupGroup = currentGenerationToken();
    expect(shouldSkipGeneration(warmupGroup)).toBe(false);
    const model: DialogModel = {
      ready: () => true,
      pickCard: async (_t, list) => list[0]?.id ?? null,
    };
    const s = new DialogSession("18+", {
      cards: BANK, model, copyStatus: "reviewed", chatFirst: false,
    });
    s.start();
    await s.send("อยากรู้เรื่องคุมกำเนิด");
    expect(shouldSkipGeneration(warmupGroup)).toBe(true);
    expect(currentGenerationToken()).not.toBe(warmupGroup);
  });
});

describe("chat-first first turn waits for readiness within the timeout", () => {
  it("does not fall back to a card while a short warm-up is still finishing", async () => {
    let ready = false;
    const model: DialogModel = {
      ready: () => ready,
      warmupRemainingMs: () => (ready ? null : 40),
      chatReply: vi.fn(async () => STUB_CHAT_REPLY_TH),
    };
    const deps: TurnDeps = {
      cards: BANK, model, copyStatus: "draft", chatFirst: true, chatTimeoutMs: 400,
    };
    const pending = runTurn(newDialog("18-24"), "ช่วงนี้กังวลเรื่องแฟน", deps);
    await delay(30);
    ready = true;
    const r = await pending;
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind === "chat") expect(r.reply.text).toBe(STUB_CHAT_REPLY_TH);
    expect(model.chatReply).toHaveBeenCalled();
  });
});
