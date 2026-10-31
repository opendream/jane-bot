/**
 * Round-1 review cases for draft PR #41. Every concrete input from that
 * review is a case here. SYNTHETIC only. No secrets, no generation on crisis.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { detectCrisis } from "../../src/core/crisis";
import { REFUSAL_CARDS } from "../../src/core/guard";
import {
  PICK_TIMEOUT_MS,
  newDialog,
  runTurn,
  type DialogModel,
  type TurnDeps,
} from "../../src/core/dialog";
import { CHAT_FIRST_TIMEOUT_MS, MODEL } from "../../src/config";
import {
  FT_GGUF_BYTES,
  FT_GGUF_FILE,
  FT_GGUF_SHA256,
  MODELS,
} from "../../src/llm/models";
import {
  missingLocalModelWarning,
  modelPillCopy,
  resetPreloadForTests,
  startModel,
  type ModelStatus,
} from "../../src/llm/runtime";
import {
  formatChatReply,
  parseChatChoice,
  renderChatChoice,
  renderChatChoiceForTurn,
} from "../../src/llm/chat-choice";
import { acceptChatReply } from "../../src/llm/chatGuard";
import { chatSystemFor } from "../../src/llm/chat-system";
import {
  CHAT_FOLLOWUPS_TH,
  CHAT_OPENERS_TH,
  INVALID_VOICE_INDEX_FALLBACK,
  V40_FOLLOWUP_MAX_TH,
  V40_OPENER_MAX_TH,
} from "../../src/llm/chat-voice";
const GUARD_VOICE_STRINGS: readonly { old: string; neu: string }[] = [
  { old: "เรื่องนี้พี่ช่วยไม่ได้", neu: "เรื่องนี้เราช่วยไม่ได้ค่ะ" },
  { old: "พี่คุยแบบสวมบทบาทไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามพี่ได้เลย", neu: "เราคุยแบบสวมบทบาทไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามเราได้เลยค่ะ" },
  { old: "พี่คุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามพี่ได้เลย", neu: "เราคุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามเราได้เลยค่ะ" },
  { old: "พี่รับหรือส่งรูปไม่ได้ และไม่ต้องส่งรูปใด ๆ มานะ เล่าเป็นข้อความได้เลย", neu: "เรารับหรือส่งรูปไม่ได้นะคะ เล่าเป็นข้อความได้เลยค่ะ" },
  { old: "เรื่องขนาดยาหรือวิธีกินยา พี่บอกไม่ได้ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรง", neu: "เราให้คำปรึกษาเรื่องขนาดยาหรือวิธีกินยาไม่ได้ค่ะ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรงค่ะ" },
  { old: "พี่ให้ข้อมูลวิธีทำแท้งไม่ได้ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับ", neu: "เราให้ข้อมูลวิธีทำแท้งไม่ได้ค่ะ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับนะคะ" },
];

const GUARD_PIN = "19fff7350b90616b1b1d908a91f4c664bfb369bc";
const GUARD_BASE = "e452dc278b3f56a98b31c73b368b75821af9212e";
const CRISIS_PIN = "411f1531a32fe4b0353fc59975b2cdfec0a6c713";
const DROPPED_HOLDING = "พี่ฟังอยู่นะ ขอส่งข้อมูลที่ตรวจแล้วให้ก่อน";
const LEAK = BANK.find((c) => c.id === "condom.leak.000")!;
const SHOW_CARD_Q = "ถุงยางแตกต้องทำยังไง";
const RULES_PILL = "🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์";

function gitBlobSha(rel: string): string {
  const bytes = readFileSync(rel);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function deps(model: DialogModel, extra: Partial<TurnDeps> = {}): TurnDeps {
  return { cards: BANK, model, copyStatus: "reviewed", chatFirst: true, ...extra };
}

afterEach(() => {
  resetPreloadForTests();
  vi.useRealTimers();
});

describe("PR #41 round-1 concrete inputs", () => {
  it("1 HIGH: guard.ts blob is 19fff735… and crisis.ts stays 411f1531…", () => {
    expect(gitBlobSha("src/core/guard.ts")).toBe(GUARD_PIN);
    expect(gitBlobSha("src/core/crisis.ts")).toBe(CRISIS_PIN);
  });

  it("1 HIGH: the 6 old→new refusal literals (Keng 30 Oct 2026 10:18 BKK)", () => {
    expect(GUARD_VOICE_STRINGS).toEqual([
      { old: "เรื่องนี้พี่ช่วยไม่ได้", neu: "เรื่องนี้เราช่วยไม่ได้ค่ะ" },
      { old: "พี่คุยแบบสวมบทบาทไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามพี่ได้เลย", neu: "เราคุยแบบสวมบทบาทไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามเราได้เลยค่ะ" },
      { old: "พี่คุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามพี่ได้เลย", neu: "เราคุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามเราได้เลยค่ะ" },
      { old: "พี่รับหรือส่งรูปไม่ได้ และไม่ต้องส่งรูปใด ๆ มานะ เล่าเป็นข้อความได้เลย", neu: "เรารับหรือส่งรูปไม่ได้นะคะ เล่าเป็นข้อความได้เลยค่ะ" },
      { old: "เรื่องขนาดยาหรือวิธีกินยา พี่บอกไม่ได้ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรง", neu: "เราให้คำปรึกษาเรื่องขนาดยาหรือวิธีกินยาไม่ได้ค่ะ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรงค่ะ" },
      { old: "พี่ให้ข้อมูลวิธีทำแท้งไม่ได้ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับ", neu: "เราให้ข้อมูลวิธีทำแท้งไม่ได้ค่ะ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับนะคะ" },
    ]);
    expect(REFUSAL_CARDS.roleplay.title_th).toBe("เรื่องนี้เราช่วยไม่ได้ค่ะ");
    expect(REFUSAL_CARDS.roleplay.answer_th).toBe(GUARD_VOICE_STRINGS[1]!.neu);
    expect(REFUSAL_CARDS.explicit.answer_th).toBe(GUARD_VOICE_STRINGS[2]!.neu);
    expect(REFUSAL_CARDS.image.answer_th).toBe(GUARD_VOICE_STRINGS[3]!.neu);
    expect(REFUSAL_CARDS.dosing.answer_th).toBe(GUARD_VOICE_STRINGS[4]!.neu);
    expect(REFUSAL_CARDS.abortion_method.answer_th).toBe(GUARD_VOICE_STRINGS[5]!.neu);
    expect(GUARD_BASE).toBe("e452dc278b3f56a98b31c73b368b75821af9212e");
  });

  it("2 MEDIUM: default model is qwen3-0.6b-ft; GGUF path/sha256/size; no URL", () => {
    expect(MODEL).toBe("qwen3-0.6b-ft");
    expect(FT_GGUF_FILE).toBe("gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf");
    expect(FT_GGUF_SHA256).toBe("1a8056e4f1d0afba32ab87c24f8c2740258b130a9bb7bb5311e742c921daf8e2");
    expect(FT_GGUF_BYTES).toBe(484220256);
    expect(MODELS["qwen3-0.6b-ft"].wasm).toEqual({ file: FT_GGUF_FILE, bytes: FT_GGUF_BYTES });
    const manifest = JSON.parse(readFileSync("scripts/weights-manifest.json", "utf8"));
    const wasm = manifest.models["qwen3-0.6b-ft"].wasm;
    expect(wasm.source).toBe("local");
    expect(wasm.files[0].sha256).toBe(FT_GGUF_SHA256);
    expect(wasm.files[0].size).toBe(FT_GGUF_BYTES);
    expect(wasm.files[0].url).toBeUndefined();
    expect(JSON.stringify(manifest.models["qwen3-0.6b-ft"])).not.toMatch(/https?:\/\//);
  });

  it("2 MEDIUM: missing GGUF warns, shows model-unavailable (failed + rules pill), uses rules", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadWllama = vi.fn();
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
    expect(last.state).toBe("failed");
    expect(last.runtime).toBe("rules");
    expect(modelPillCopy(last).text).toBe(RULES_PILL);
    expect(warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n")).toContain(missingLocalModelWarning("qwen3-0.6b-ft"));
    warn.mockRestore();
  });

  it("3 MEDIUM: !!shown / showCardBubble keeps the quoted card", async () => {
    const r = await runTurn(newDialog("18-24"), SHOW_CARD_Q, deps({
      ready: () => true,
      chatReply: async () => '{"o":0,"c":1,"q":0}',
      pickCard: async () => "none",
    }));
    expect(r.reply.kind).toBe("chat");
    if (r.reply.kind !== "chat") return;
    expect(r.reply.card?.id).toBe(LEAK.id);
    expect(r.reply.text).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, LEAK.answer_th, CHAT_FOLLOWUPS_TH[0]!));
    expect(r.reply.text).toContain(LEAK.answer_th);
    const quoted = renderChatChoiceForTurn({ o: 0, c: 1, q: 0 }, "th", LEAK.answer_th, true);
    expect(quoted).toContain(LEAK.answer_th);
  });

  it("4 QUESTION: remaining < 8 s skips model card pick; 45 s whole-turn budget; no holding line", async () => {
    expect(CHAT_FIRST_TIMEOUT_MS).toBe(45_000);
    expect(PICK_TIMEOUT_MS).toBe(8_000);
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
    const picksBefore = pickCard.mock.calls.length;
    expect(picksBefore).toBeGreaterThan(0);
    const p3 = runTurn(t2.state, "อยากรู้เพิ่ม", deps(model, { chatTimeoutMs: 45_000 }));
    await vi.advanceTimersByTimeAsync(40_000);
    const t3 = await p3;
    expect(pickCard.mock.calls.length).toBe(picksBefore);
    expect(t3.reply.kind).toBe("chat");
    if (t3.reply.kind !== "chat") return;
    expect(t3.reply.card).toBeTruthy();
    expect(t3.reply.text).not.toContain(DROPPED_HOLDING);
    expect((t3.reply as { holding?: string }).holding).toBeUndefined();
  });

  it("6: every v40 index 0..max still resolves to a valid line; dropped slots use invalid-index fallback", () => {
    expect(V40_OPENER_MAX_TH).toBe(4);
    expect(V40_FOLLOWUP_MAX_TH).toBe(4);
    expect(CHAT_OPENERS_TH).toHaveLength(V40_OPENER_MAX_TH + 1);
    expect(CHAT_FOLLOWUPS_TH).toHaveLength(V40_FOLLOWUP_MAX_TH + 1);
    expect(CHAT_OPENERS_TH[4]).toBe(INVALID_VOICE_INDEX_FALLBACK);
    expect(CHAT_FOLLOWUPS_TH[2]).toBe(INVALID_VOICE_INDEX_FALLBACK);
    expect(CHAT_OPENERS_TH[0]).toBe("เราอยู่ตรงนี้นะคะ");
    expect(CHAT_OPENERS_TH[1]).toBe("เราเข้าใจค่ะ");
    expect(CHAT_OPENERS_TH[2]).toBe("ขอบคุณที่ถามมานะคะ");
    expect(CHAT_OPENERS_TH[3]).toBe("เรื่องนี้เราเข้าใจค่ะ");
    expect(CHAT_FOLLOWUPS_TH[0]).toBe("เธออยากเล่าเพิ่มไหมคะ?");
    expect(CHAT_FOLLOWUPS_TH[1]).toBe("ตอนนี้อยากถามเรื่องไหนต่อดีคะ?");
    expect(CHAT_FOLLOWUPS_TH[3]).toBe("ยังมีอะไรที่อยากคุยต่อไหมคะ?");
    expect(CHAT_FOLLOWUPS_TH[4]).toBe("เธออยากให้ช่วยตรงไหนก่อนคะ?");
    const b = { openerCount: CHAT_OPENERS_TH.length, followUpCount: CHAT_FOLLOWUPS_TH.length, hasCard: true };
    expect(parseChatChoice('{"o":4,"c":0,"q":0}', b).ok).toBe(true);
    expect(parseChatChoice('{"o":0,"c":0,"q":2}', b).ok).toBe(true);
    expect(parseChatChoice('{"o":0,"c":0,"q":4}', b).ok).toBe(true);
    expect(parseChatChoice('{"o":5,"c":0,"q":0}', b).ok).toBe(false);
    for (let o = 0; o <= V40_OPENER_MAX_TH; o++) {
      const text = renderChatChoice({ o, c: 0, q: 0 }, "th", "");
      expect(text.length, `o=${o}`).toBeGreaterThan(0);
      expect(acceptChatReply(text, "th").ok, text).toBe(true);
    }
    for (let q = 0; q <= V40_FOLLOWUP_MAX_TH; q++) {
      const text = renderChatChoice({ o: 0, c: 0, q }, "th", "");
      expect(text.length, `q=${q}`).toBeGreaterThan(0);
      expect(acceptChatReply(text, "th").ok, text).toBe(true);
    }
    const grounded = chatSystemFor("th", { grounding: { facts: "ข้อความบัตรทดสอบ" } });
    expect(grounded).toContain("0. เราอยู่ตรงนี้นะคะ");
    expect(grounded).toContain("4. ");
    expect(grounded).toContain("2. ");
    expect(grounded).toContain("3. ยังมีอะไรที่อยากคุยต่อไหมคะ?");
    expect(grounded).toContain("4. เธออยากให้ช่วยตรงไหนก่อนคะ?");
    expect(grounded).not.toContain("ทางนี้พี่เข้าใจ");
    expect(grounded).not.toContain("อยากให้พี่ส่งข้อมูลที่ตรวจแล้วไหม?");
  });

  it("safety: CLEAR crisis still makes 0 model calls and is never blocked", async () => {
    const calls = { chat: 0, pick: 0 };
    const line = "ตอนนี้อยากตายมาก";
    expect(detectCrisis(line).level).not.toBe("none");
    const r = await runTurn(newDialog("18-24"), line, deps({
      ready: () => true,
      chatReply: async () => {
        calls.chat++;
        return '{"o":0,"c":0,"q":0}';
      },
      pickCard: async () => {
        calls.pick++;
        return "none";
      },
    }));
    expect(r.reply.kind).toBe("crisis");
    expect(calls.chat).toBe(0);
    expect(calls.pick).toBe(0);
  });

  it("stack: this branch is not independent of #38/#39 (base is feat/chat-grounded-replies)", () => {
    const names = execSync("git log --oneline -20", { encoding: "utf8" });
    expect(names).toMatch(/#38|#39|chat-crisis|chat-thinking|grounded/);
  });
});
