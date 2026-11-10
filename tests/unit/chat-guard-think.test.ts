import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { newDialog, runTurn, type DialogModel, type TurnDeps } from "../../src/core/dialog";
import { debugEnabled } from "../../src/config";
import {
  CHAT_GUARD_DEBUG_RAW_CHARS,
  acceptChatReply,
  chatGuardDebugRawPreview,
  chatGuardFailures,
  normaliseChatReply,
} from "../../src/llm/chatGuard";
import {
  WLLAMA_NO_THINK_KWARGS,
  buildWllamaChatPrompt,
  chatSystemFor,
} from "../../src/llm/chat-system";
import { chatMsgFromReply, chatView, newChat, type ChatHooks } from "../../src/ui/chat";

// SYNTHETIC strings only — never real names, phones, or clinical claims.

const FLOW = [
  "ปวดประจำเดือน",
  "แล้วถ้ามาช้ากว่าปกตินิดหน่อยละ",
  "มีอะไรกับแฟนด้วย แล้วลืมกินยาคุม กลัวท้อง",
] as const;

const THAI = {
  period: "เราฟังอยู่นะคะ เธอเล่าเรื่องประจำเดือนต่อได้เลยค่ะ",
  late: "เราเข้าใจค่ะ เธอเล่าต่อได้เลยนะคะ",
  pill: "เราอยู่ตรงนี้ค่ะ เธอเล่าเรื่องยาคุมต่อได้เลยนะคะ",
} as const;

/** Truncated mid-English-reasoning. No closer, no Thai. 128-token-style dump. */
function unclosedThink(topic: string): string {
  return [
    "<think>",
    `The user wrote about ${topic}. Stay warm as Jane, two short sentences, no hotline.`,
    "I should not diagnose. First I will outline the reply in English then switch to Thai once I have",
  ].join("\n");
}

const deps = (model: DialogModel, extra: Partial<TurnDeps> = {}): TurnDeps => ({
  cards: BANK, model, copyStatus: "reviewed", chatFirst: true, ...extra,
});

function hooks(): ChatHooks {
  return { rerender() {}, crisis() {} };
}

/** Enough of the DOM for chatView in node. */
function installChatDom(): void {
  if (typeof document !== "undefined" && typeof document.createElement === "function") return;
  class MiniNode { childNodes: MiniNode[] = []; }
  class MiniText extends MiniNode { constructor(readonly data: string) { super(); } }
  class MiniEl extends MiniNode {
    tagName: string;
    attrs: Record<string, string> = {};
    className = "";
    value = "";
    constructor(tag: string) { super(); this.tagName = tag.toUpperCase(); }
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
    getAttribute(k: string) { return this.attrs[k] ?? null; }
    addEventListener() {}
    append(...nodes: MiniNode[]) { this.childNodes.push(...nodes); }
    appendChild(n: MiniNode) { this.append(n); return n; }
    querySelector(sel: string): MiniEl | null {
      const id = /\[data-testid="([^"]+)"\]/.exec(sel)?.[1];
      const walk = (el: MiniNode): MiniEl | null => {
        if (el instanceof MiniEl && id && el.attrs["data-testid"] === id) return el;
        for (const c of el.childNodes) {
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    }
  }
  const g = globalThis as typeof globalThis & {
    Node: typeof MiniNode;
    HTMLElement: typeof MiniEl;
    HTMLTextAreaElement: typeof MiniEl;
    document: { createElement: (t: string) => MiniEl; createTextNode: (t: string) => MiniText };
  };
  g.Node = MiniNode;
  g.HTMLElement = MiniEl;
  g.HTMLTextAreaElement = MiniEl;
  g.document = {
    createElement: (t: string) => new MiniEl(t),
    createTextNode: (t: string) => new MiniText(t),
  };
}

function nodeText(el: { data?: string; childNodes?: unknown[] } | null): string {
  if (!el) return "";
  if (typeof el.data === "string") return el.data;
  return (el.childNodes ?? []).map((c) => nodeText(c as { data?: string; childNodes?: unknown[] })).join("");
}

describe("normaliseChatReply strips think blocks before the guard", () => {
  it.each([
    ["period pain", FLOW[0], unclosedThink("menstrual pain")],
    ["period a bit late", FLOW[1], unclosedThink("a slightly late period")],
    ["missed pill", FLOW[2], unclosedThink("a missed pill and pregnancy fear")],
  ] as const)("unclosed think truncated mid-English for %s is rejected with no Thai left", async (_name, user, raw) => {
    expect(raw).toMatch(/^<think>/);
    expect(raw).not.toMatch(/<\/think>/);
    expect(normaliseChatReply(raw)).toBe("");
    expect(normaliseChatReply(raw)).not.toMatch(/[\u0E00-\u0E7F]/);
    expect(acceptChatReply(raw).ok).toBe(false);
    expect(chatGuardFailures(raw)).toEqual(["empty"]);

    const model: DialogModel = { ready: () => true, chatReply: vi.fn(async () => raw) };
    const r = await runTurn(newDialog("18-24"), user, deps(model));
    expect(r.reply.kind).toBe("card");
    if (r.reply.kind !== "card") return;
    expect(r.reply.text).toBe(r.reply.card.answer_th);
    expect(r.reply.chatGuardReasons).toEqual(["empty"]);
    expect(r.reply.text).not.toMatch(/The user wrote/);
  });

  it("closed think then a Thai เรา/เธอ reply is accepted with the think text gone", () => {
    const raw = `<think>\nThe user has period pain. Two short sentences. Be warm.\n</think>\n${THAI.period}`;
    expect(normaliseChatReply(raw)).toBe(THAI.period);
    expect(acceptChatReply(raw)).toEqual({ ok: true, text: THAI.period });
    expect(normaliseChatReply(raw)).not.toMatch(/The user has period pain/);
    expect(normaliseChatReply(raw)).not.toMatch(/<\/?think>/i);
  });

  it("empty think prefix plus a Thai เรา/เธอ reply is accepted", () => {
    const raw = `<think>\n\n</think>\n\n${THAI.late}`;
    expect(normaliseChatReply(raw)).toBe(THAI.late);
    expect(acceptChatReply(raw)).toEqual({ ok: true, text: THAI.late });
  });

  it("stray </think> drops everything before the closer and keeps the Thai reply", () => {
    const raw = `The user missed a pill and I was still reasoning.\n</think>\n${THAI.pill}`;
    expect(normaliseChatReply(raw)).toBe(THAI.pill);
    expect(acceptChatReply(raw)).toEqual({ ok: true, text: THAI.pill });
    expect(normaliseChatReply(raw)).not.toMatch(/The user missed/);
  });
});

describe("wllama prompt builder applies the no-thinking Jinja hard switch", () => {
  it("sets chat_template_kwargs.enable_thinking false and does not use /no_think or an assistant prefix", () => {
    expect(WLLAMA_NO_THINK_KWARGS).toEqual({ enable_thinking: false });
    const prompt = buildWllamaChatPrompt(chatSystemFor("th"), [], FLOW[0]);
    expect(prompt.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(prompt.messages).toEqual([
      { role: "system", content: chatSystemFor("th") },
      { role: "user", content: FLOW[0] },
    ]);
    expect(prompt.messages.some((m) => /\/no_think/i.test(m.content))).toBe(false);
    expect(prompt.messages.some((m) => m.role === "assistant")).toBe(false);
    expect(prompt.messages.some((m) => /<think>/i.test(m.content))).toBe(false);
  });

  it("keeps history turns and still passes enable_thinking false", () => {
    const prompt = buildWllamaChatPrompt(
      chatSystemFor("th"),
      [
        { role: "user", content: FLOW[0] },
        { role: "assistant", content: THAI.period },
      ],
      FLOW[1],
    );
    expect(prompt.chat_template_kwargs.enable_thinking).toBe(false);
    expect(prompt.messages.at(-1)).toEqual({ role: "user", content: FLOW[1] });
    expect(prompt.messages).toHaveLength(4);
    expect(JSON.stringify(prompt)).not.toMatch(/no_think/);
  });
});

describe("?debug=1 shows reason codes next to a short in-memory raw preview", () => {
  it("debugEnabled stays off unless ?debug=1", () => {
    expect(debugEnabled("")).toBe(false);
    expect(debugEnabled("?debug=1")).toBe(true);
  });

  it("chatGuardDebugRawPreview is the first ~160 characters, whitespace-collapsed", () => {
    const raw = unclosedThink("menstrual pain");
    const preview = chatGuardDebugRawPreview(raw);
    expect(preview.startsWith("<think>")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(CHAT_GUARD_DEBUG_RAW_CHARS);
    expect(preview).toContain("The user wrote");
    expect(preview).not.toMatch(/\n/);
  });

  it("runTurn with debug attaches the preview on a rejected unclosed think; off by default", async () => {
    const raw = unclosedThink("a missed pill and pregnancy fear");
    const model: DialogModel = { ready: () => true, chatReply: vi.fn(async () => raw) };

    const off = await runTurn(newDialog("18-24"), FLOW[2], deps(model));
    expect(off.reply.kind).toBe("card");
    if (off.reply.kind !== "card") return;
    expect(off.reply.chatGuardReasons).toEqual(["empty"]);
    expect(off.reply.chatGuardRawPreview).toBeUndefined();
    expect(JSON.stringify(off.reply)).not.toContain("<think>");

    const on = await runTurn(newDialog("18-24"), FLOW[2], deps(model, { debug: true }));
    expect(on.reply.kind).toBe("card");
    if (on.reply.kind !== "card") return;
    expect(on.reply.chatGuardReasons).toEqual(["empty"]);
    expect(on.reply.chatGuardRawPreview).toBe(chatGuardDebugRawPreview(raw));
    expect(on.reply.chatGuardRawPreview).toContain("<think>");
    expect(on.reply.text).toBe(on.reply.card.answer_th);
  });

  it("on-screen debug line includes reason codes and the raw preview only with ?debug=1", () => {
    installChatDom();
    const preview = chatGuardDebugRawPreview(unclosedThink("menstrual pain"));
    const reply = {
      kind: "card" as const,
      card: BANK.find((c) => c.id === "general.fallback.000")!,
      text: "card",
      reworded: false,
      via: "guard" as const,
      banner: [] as const,
      chips: [],
      offer: "none" as const,
      offerIntents: [],
      capNotice: null,
      chatGuardReasons: ["empty" as const],
      chatGuardRawPreview: preview,
    };

    const off = newChat("18-24", null);
    expect(off.debug).toBe(false);
    const offMsg = chatMsgFromReply(reply, false, true, false);
    expect(offMsg?.debugGuard).toBe("empty");
    expect(offMsg?.debugGuardRaw).toBeUndefined();
    off.messages.push(offMsg!);
    expect(chatView(off, hooks()).querySelector('[data-testid="chat-guard-debug"]')).toBeNull();

    const on = newChat("18-24", null, null, { search: "?debug=1" });
    expect(on.debug).toBe(true);
    const onMsg = chatMsgFromReply(reply, false, true, true);
    expect(onMsg?.debugGuard).toBe("empty");
    expect(onMsg?.debugGuardRaw).toBe(preview);
    on.messages.push(onMsg!);
    const line = chatView(on, hooks()).querySelector('[data-testid="chat-guard-debug"]');
    expect(line).not.toBeNull();
    const shown = nodeText(line as { data?: string; childNodes?: unknown[] });
    expect(shown).toContain("guard: empty");
    expect(shown).toContain("raw:");
    expect(shown).toContain("<think>");
  });
});
