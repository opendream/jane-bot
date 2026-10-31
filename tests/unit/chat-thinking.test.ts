import { describe, expect, it, vi } from "vitest";
import {
  CHAT_THINKING_COPY_EN_STATUS,
  CHAT_THINKING_COPY_STATUS,
  CHAT_THINKING_PHRASES,
  CHAT_THINKING_ROTATE_MS,
  applyChatThinkingPhrase,
  prefersReducedMotion,
  thinkingLabelFor,
  thinkingPhraseAt,
} from "../../src/ui/chat-thinking";

describe("chat-first thinking copy (Thai FINAL, English DRAFT)", () => {
  it("exports the FINAL Thai phrases and keeps English DRAFT", () => {
    expect(CHAT_THINKING_COPY_STATUS).toBe("reviewed");
    expect(CHAT_THINKING_COPY_EN_STATUS).toBe("draft");
    expect(CHAT_THINKING_PHRASES.status).toBe("reviewed");
    expect(CHAT_THINKING_PHRASES.enStatus).toBe("draft");
    expect(CHAT_THINKING_PHRASES.th).toEqual([
      "พี่เจนกำลังคิดอยู่นะ",
      "พี่อ่านข้อความของเราอยู่นะ",
      "กำลังเรียบเรียงคำพูดอยู่",
      "แป๊บนึงนะ พี่อยู่ตรงนี้",
      "ค่อย ๆ คุยกันไปนะ",
      "พี่กำลังดูข้อมูลที่เกี่ยวข้องอยู่",
      "ไม่ต้องรีบนะ พิมพ์เพิ่มได้เลย",
      "ขอเวลาพี่อีกนิดนะ",
    ]);
    expect(CHAT_THINKING_PHRASES.th).toHaveLength(8);
    expect(CHAT_THINKING_PHRASES.en).toEqual([
      "Jane is thinking…",
      "I'm reading your messages…",
      "Putting my words together…",
      "One moment, I'm right here.",
      "We'll take this one step at a time.",
      "Looking at the related information…",
      "No rush, you can keep typing.",
      "Just a little more time…",
    ]);
    expect(thinkingLabelFor("th")).toBe("พี่เจนกำลังคิด");
    expect(thinkingLabelFor("en")).toBe("Jane is thinking");
    expect(CHAT_THINKING_ROTATE_MS).toBeGreaterThanOrEqual(2000);
    expect(CHAT_THINKING_ROTATE_MS).toBeLessThanOrEqual(3000);
  });

  it("thinkingPhraseAt wraps around the phrase set", () => {
    expect(thinkingPhraseAt("th", 0)).toBe("พี่เจนกำลังคิดอยู่นะ");
    expect(thinkingPhraseAt("th", 8)).toBe("พี่เจนกำลังคิดอยู่นะ");
    expect(thinkingPhraseAt("en", 0)).toBe("Jane is thinking…");
  });

  it("applyChatThinkingPhrase writes the visible phrase and never the live label", () => {
    const phrase = { textContent: thinkingPhraseAt("th", 0) };
    const label = { textContent: thinkingLabelFor("th") };
    const root = {
      querySelector: (sel: string) => {
        if (sel === '[data-testid="chat-thinking-phrase"]') return phrase;
        if (sel === '[data-testid="chat-thinking-label"]') return label;
        return null;
      },
    };
    expect(applyChatThinkingPhrase(root, thinkingPhraseAt("th", 1))).toBe(true);
    expect(phrase.textContent).toBe("พี่อ่านข้อความของเราอยู่นะ");
    expect(label.textContent).toBe("พี่เจนกำลังคิด");
    expect(applyChatThinkingPhrase({ querySelector: () => null }, thinkingPhraseAt("th", 2))).toBe(false);
  });

  it("prefersReducedMotion follows matchMedia", () => {
    const orig = globalThis.matchMedia;
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("prefers-reduced-motion") && q.includes("reduce"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {} }));
    expect(prefersReducedMotion()).toBe(false);
    if (orig) vi.stubGlobal("matchMedia", orig);
    else vi.unstubAllGlobals();
  });
});
