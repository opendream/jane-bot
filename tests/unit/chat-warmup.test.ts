import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DialogSession,
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import { BANK } from "../../src/core/bankData";
import {
  CHAT_WARMUP_LANG,
  CHAT_WARMUP_MAX_TOKENS,
  CHAT_WARMUP_USER,
  runChatWarmup,
} from "../../src/llm/chat-warmup";
import { createGenerationQueue } from "../../src/llm/generation-queue";
import {
  currentGenerationToken,
  resetGenerationTokenForTests,
  shouldSkipGeneration,
} from "../../src/llm/generation-token";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";

afterEach(() => {
  resetGenerationTokenForTests();
});

const A = "ช่วงนี้กังวลเรื่องแฟน";

describe("chat load warm-up", () => {
  it("uses the fixed synthetic prompt, max 1 token, and makes no network requests", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const seen: Array<{ user: string; maxTokens: number; lang: string }> = [];
    await runChatWarmup(async (opts) => {
      seen.push({ user: opts.user, maxTokens: opts.maxTokens, lang: opts.lang });
    });
    expect(seen).toEqual([{
      user: CHAT_WARMUP_USER,
      maxTokens: CHAT_WARMUP_MAX_TOKENS,
      lang: CHAT_WARMUP_LANG,
    }]);
    expect(CHAT_WARMUP_USER).toBe("สวัสดี");
    expect(CHAT_WARMUP_MAX_TOKENS).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("crisis during an in-flight warm-up still opens the crisis screen with 0 model calls", async () => {
    const queue = createGenerationQueue();
    const seen: string[] = [];
    const warmup = queue.run(currentGenerationToken(), undefined, async (s) => {
      seen.push(CHAT_WARMUP_USER);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 80);
        const onAbort = () => { clearTimeout(t); reject(new Error("aborted")); };
        if (s.aborted) return onAbort();
        s.addEventListener("abort", onAbort, { once: true });
      }).catch(() => null);
      return "warm";
    });
    const calls = { chat: 0 };
    const model: DialogModel = {
      ready: () => true,
      chatReply: (text, _h, signal, _lang, groupId) => queue.run(groupId, signal, async (s) => {
        if (shouldSkipGeneration(groupId, s)) return null;
        calls.chat++;
        seen.push(text);
        return STUB_CHAT_REPLY_TH;
      }),
    };
    const deps: TurnDeps = { cards: BANK, model, copyStatus: "draft", chatFirst: true };
    const s = new DialogSession("18+", deps);
    s.start();
    const r = await s.send("อยากตาย");
    expect(r?.kind).toBe("crisis");
    expect(calls.chat).toBe(0);
    expect(seen.filter((t) => t !== CHAT_WARMUP_USER)).toEqual([]);
    await warmup;

    const grouped = await runTurn(newDialog(), "อยากตาย", deps);
    expect(grouped.reply.kind).toBe("crisis");
    expect(calls.chat).toBe(0);
  });

  it("a non-crisis user turn cancels warm-up instead of waiting behind it", async () => {
    const queue = createGenerationQueue();
    let warmupFinished = false;
    const warmup = queue.run(currentGenerationToken(), undefined, async (s) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => { warmupFinished = true; resolve(); }, 200);
        const onAbort = () => { clearTimeout(t); reject(new Error("aborted")); };
        if (s.aborted) return onAbort();
        s.addEventListener("abort", onAbort, { once: true });
      }).catch(() => null);
      return "warm";
    });
    const model: DialogModel = {
      ready: () => true,
      chatReply: (_t, _h, signal, _lang, groupId) => queue.run(groupId, signal, async (s) => {
        if (shouldSkipGeneration(groupId, s)) return null;
        return STUB_CHAT_REPLY_TH;
      }),
    };
    const s = new DialogSession("18+", { cards: BANK, model, copyStatus: "draft", chatFirst: true });
    s.start();
    const t0 = Date.now();
    const r = await s.send(A);
    expect(r?.kind).toBe("chat");
    expect(Date.now() - t0).toBeLessThan(120);
    await warmup;
    expect(warmupFinished).toBe(false);
  });
});
