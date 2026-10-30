import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { MODEL, CHAT_FIRST_TIMEOUT_MS } from "../../src/config";
import { MODELS } from "../../src/llm/models";
import { CHAT_MAX_TOKENS, CHAT_SYSTEM, chatSystemFor } from "../../src/llm/chat-system";
import { CHAT_FOLLOWUPS_TH, CHAT_OPENERS_TH } from "../../src/llm/chat-voice";
import { missingLocalModelWarning, modelPillCopy, resetPreloadForTests, startModel, type ModelStatus } from "../../src/llm/runtime";
import type { LLMAdapter } from "../../src/llm/adapter";
import { BANK } from "../../src/core/bankData";
import { detectCrisis } from "../../src/core/crisis";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";

const DROPPED_HOLDING_LINE = "พี่ฟังอยู่นะ ขอส่งข้อมูลที่ตรวจแล้วให้ก่อน";
const DROPPED_HOLDING_LINE_EN = "I hear you. Let me share the checked information first.";
const FT_FILE = "gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf";
const FT_BYTES = 484220256;
const FT_SHA = "1a8056e4f1d0afba32ab87c24f8c2740258b130a9bb7bb5311e742c921daf8e2";
const FT_LABEL = "Qwen3-0.6B (Jane fine-tuned)";

const manifest = JSON.parse(fs.readFileSync("scripts/weights-manifest.json", "utf8"));

function fakeWasm(label = FT_LABEL): LLMAdapter {
  return {
    name: `${label} (WASM)`,
    runtime: "wasm",
    ready: () => true,
    classify: async () => ["other"],
    polishSummary: async () => null,
  };
}

afterEach(() => {
  resetPreloadForTests();
  vi.useRealTimers();
});

const deps = (model: DialogModel, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "reviewed", chatFirst: true, ...extra,
});

describe("default model is fine-tuned Qwen3-0.6B (WASM, local)", () => {
  it("with no URL params, startModel loads qwen3-0.6b-ft on the WASM path", async () => {
    const files: string[] = [];
    const statuses: ModelStatus[] = [];
    let webgpu = 0;
    const a = await startModel((s) => statuses.push({ ...s }), {
      search: "",
      gpuInfo: async () => ({ ok: true, f16: true }),
      installed: async () => [{ model: "qwen3-0.6b-ft", variants: ["wasm"] }],
      loadWebLLM: async () => {
        webgpu += 1;
        throw new Error("0.6b-ft has no WebGPU build");
      },
      loadWllama: async (file, label, onP) => {
        files.push(file);
        onP(1);
        return fakeWasm(label);
      },
    });
    expect(MODEL).toBe("qwen3-0.6b-ft");
    expect(webgpu).toBe(0);
    expect(a?.runtime).toBe("wasm");
    expect(files).toEqual([FT_FILE]);
    expect(MODELS["qwen3-0.6b-ft"].wasm).toEqual({ file: FT_FILE, bytes: FT_BYTES });
    expect(statuses.at(-1)).toMatchObject({ state: "ready", runtime: "wasm", label: FT_LABEL });
  });

  it("?model=qwen3-1.7b still selects 1.7B", async () => {
    const files: string[] = [];
    const a = await startModel(() => {}, {
      search: "?model=qwen3-1.7b&runtime=wasm",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed: async () => [{ model: "qwen3-1.7b", variants: ["wasm"] }],
      loadWllama: async (file, label, onP) => {
        files.push(file);
        onP(1);
        return fakeWasm(label);
      },
    });
    expect(a?.runtime).toBe("wasm");
    expect(files).toEqual(["gguf/Qwen3-1.7B-Q4_K_M.gguf"]);
    expect(MODELS["qwen3-1.7b"].label).toBe("Qwen3-1.7B");
  });

  it("?model=off stays on rules", async () => {
    const loadWllama = vi.fn(async () => fakeWasm());
    const a = await startModel(() => {}, {
      search: "?model=off",
      installed: async () => [{ model: "qwen3-0.6b-ft", variants: ["wasm"] }],
      loadWllama,
    });
    expect(a).toBeNull();
    expect(loadWllama).not.toHaveBeenCalled();
  });

  it("missing GGUF does not fail silently: warns, shows the rules-only failed pill, uses rules", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadWllama = vi.fn(async () => fakeWasm());
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), {
      search: "",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed: async () => [],
      loadWllama,
    });
    expect(a).toBeNull();
    expect(loadWllama).not.toHaveBeenCalled();
    const last = statuses.at(-1)!;
    expect(last).toMatchObject({ state: "failed", runtime: "rules" });
    expect(modelPillCopy(last).text).toBe("🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์");
    expect(warn).toHaveBeenCalled();
    const msg = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(msg).toContain(missingLocalModelWarning("qwen3-0.6b-ft"));
    expect(msg).toContain(FT_FILE);
    expect(msg).toContain(FT_SHA);
    expect(msg).toContain(String(FT_BYTES));
    expect(msg).not.toMatch(/https?:\/\//);
    warn.mockRestore();
  });

  it("installed wasm whose load throws also warns and shows failed, not silent off", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const statuses: ModelStatus[] = [];
    const a = await startModel((s) => statuses.push({ ...s }), {
      search: "",
      gpuInfo: async () => ({ ok: false, f16: false }),
      installed: async () => [{ model: "qwen3-0.6b-ft", variants: ["wasm"] }],
      loadWllama: async () => {
        throw new Error("model file missing: gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf (404)");
      },
    });
    expect(a).toBeNull();
    const last = statuses.at(-1)!;
    expect(last).toMatchObject({ state: "failed", runtime: "rules" });
    expect(modelPillCopy(last).text).toBe("🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์");
    expect(warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n")).toContain("qwen3-0.6b-ft");
    warn.mockRestore();
  });

  it("manifest pins sha256/size, has no URL, and the repo has no base-0.6B entry", () => {
    const wasm = manifest.models["qwen3-0.6b-ft"].wasm;
    expect(wasm.source).toBe("local");
    expect(wasm.files[0].sha256).toBe(FT_SHA);
    expect(wasm.files[0].size).toBe(FT_BYTES);
    expect(wasm.files[0].url).toBeUndefined();
    expect(JSON.stringify(manifest.models["qwen3-0.6b-ft"])).not.toMatch(/https?:\/\//);
    expect(Object.keys(MODELS)).not.toContain("qwen3-0.6b");
    const baseNeedle = "Qwen3-0.6B";
    const hits = execSync(
      `git grep -n "${baseNeedle}-Q4_K_M\\|unsloth/${baseNeedle}" || true`,
      { encoding: "utf8" },
    ).trim();
    expect(hits).toBe("");
  });
});

describe("per-turn model time limit and max-token cap", () => {
  it("CHAT_FIRST_TIMEOUT_MS is 45 s and CHAT_MAX_TOKENS is 24", () => {
    expect(CHAT_FIRST_TIMEOUT_MS).toBe(45_000);
    expect(CHAT_MAX_TOKENS).toBe(24);
  });

  it("timeout shows the rules card alone, ignores late output, and passes the max-token cap", async () => {
    vi.useFakeTimers();
    let late = false;
    let seenMax: number | undefined;
    const calls = { chat: 0 };
    const model: DialogModel = {
      ready: () => true,
      chatReply: vi.fn(async (_t, _h, _signal, _l, _g, opts) => {
        calls.chat++;
        seenMax = opts?.maxTokens;
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            late = true;
            resolve('{"o":0,"c":0,"q":0}');
          }, 60_000);
        });
      }),
    };
    const p = runTurn(newDialog("18-24"), "อยากรู้เรื่องคุมกำเนิด", deps(model, { chatTimeoutMs: CHAT_FIRST_TIMEOUT_MS }));
    await vi.advanceTimersByTimeAsync(45_000);
    const r = await p;
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind !== "card") return;
    expect(r.reply.text).toBe(r.reply.card.answer_th);
    expect(r.reply.text).not.toContain(DROPPED_HOLDING_LINE);
    expect(r.reply.text).not.toContain(DROPPED_HOLDING_LINE_EN);
    expect((r.reply as { holding?: string }).holding).toBeUndefined();
    expect(seenMax).toBe(CHAT_MAX_TOKENS);
    expect(calls.chat).toBe(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(late).toBe(true);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.text).not.toContain(DROPPED_HOLDING_LINE);
    }
  });

  it("the 45 s budget covers the retry and does not restart the clock", async () => {
    vi.useFakeTimers();
    let n = 0;
    let late = false;
    const model: DialogModel = {
      ready: () => true,
      chatReply: async (_t, _h, signal) => {
        n++;
        if (n === 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
          return "not-json";
        }
        return new Promise<string>((resolve, reject) => {
          const t = setTimeout(() => {
            late = true;
            resolve('{"o":0,"c":0,"q":0}');
          }, 30_000);
          const onAbort = () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          };
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      },
    };
    const p = runTurn(newDialog("18-24"), "อยากรู้เรื่องคุมกำเนิด", deps(model, { chatTimeoutMs: 45_000 }));
    await vi.advanceTimersByTimeAsync(45_000);
    const r = await p;
    expect(n).toBe(2);
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind === "card") {
      expect(r.reply.text).toBe(r.reply.card.answer_th);
      expect(r.reply.text).not.toContain(DROPPED_HOLDING_LINE);
    }
    expect(late).toBe(false);
  });

  it("remaining budget under 8 s skips the model card pick and uses the rules card alone", async () => {
    vi.useFakeTimers();
    let n = 0;
    const pickCard = vi.fn(async () => "none");
    const model: DialogModel = {
      ready: () => true,
      chatReply: async () => {
        n++;
        if (n === 3) await new Promise<void>((resolve) => setTimeout(resolve, 40_000));
        return '{"o":0,"c":0,"q":0}';
      },
      pickCard,
    };
    const t1 = await runTurn(newDialog("18-24"), "ถุงยางแตกทำไงดี", deps(model, { chatTimeoutMs: 45_000 }));
    const t2 = await runTurn(t1.state, "แล้วยังไงต่อดี", deps(model, { chatTimeoutMs: 45_000 }));
    expect(pickCard.mock.calls.length).toBeGreaterThan(0);
    const picksBefore = pickCard.mock.calls.length;
    const p3 = runTurn(t2.state, "อยากรู้เพิ่ม", deps(model, { chatTimeoutMs: 45_000 }));
    await vi.advanceTimersByTimeAsync(40_000);
    const t3 = await p3;
    expect(n).toBe(3);
    expect(pickCard.mock.calls.length).toBe(picksBefore);
    expect(t3.reply.kind).toBe("chat");
    if (t3.reply.kind !== "chat") return;
    expect(t3.reply.card).toBeTruthy();
    expect(t3.reply.cardText).toBe(t3.reply.card!.answer_th);
    expect(t3.reply.text).not.toContain(DROPPED_HOLDING_LINE);
    expect(t3.reply.text).not.toContain(DROPPED_HOLDING_LINE_EN);
    expect((t3.reply as { holding?: string }).holding).toBeUndefined();
  });

  it("CLEAR crisis makes 0 stub calls", async () => {
    const calls = { chat: 0 };
    const model: DialogModel = {
      ready: () => true,
      chatReply: async () => {
        calls.chat++;
        return '{"o":0,"c":0,"q":0}';
      },
    };
    const line = "ตอนนี้อยากตายมาก";
    expect(detectCrisis(line).level).not.toBe("none");
    const r = await runTurn(newDialog("18-24"), line, deps(model));
    expect(r.reply.kind).toBe("crisis");
    expect(calls.chat).toBe(0);
  });
});

describe("model text pin (Commit 1 name + re-indexed lists only)", () => {
  it("persona uses เจน and lists follow the current opener/follow-up arrays", () => {
    expect(CHAT_SYSTEM.startsWith("คุณคือเจน ")).toBe(true);
    expect(CHAT_SYSTEM).not.toContain("พี่เจน");
    const grounded = chatSystemFor("th", { grounding: { facts: "ข้อความบัตรทดสอบ" } });
    for (const [i, s] of CHAT_OPENERS_TH.entries()) {
      expect(grounded).toContain(`${i}. ${s}`);
    }
    for (const [i, s] of CHAT_FOLLOWUPS_TH.entries()) {
      expect(grounded).toContain(`${i}. ${s}`);
    }
    expect(grounded).toContain("4. ");
    expect(grounded).not.toContain("อยากให้พี่ส่งข้อมูลที่ตรวจแล้วไหม?");
    expect(grounded).not.toContain("ทางนี้พี่เข้าใจ");
  });
});
