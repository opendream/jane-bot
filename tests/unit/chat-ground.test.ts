import { describe, expect, it } from "vitest";
import { ENGLISH_MODEL_CHAT } from "../../src/config";
import { BANK, BANK_FIXTURES } from "../../src/core/bankData";
import { retrieve } from "../../src/core/retrieve";
import { FALLBACK_ID, WELCOME_ID } from "../../src/core/dialog";
import { shippable } from "../../src/core/bank";
import {
  CHAT_GROUND_FACTS_TH,
  CHAT_GROUND_NONE_TH,
  CHAT_GROUND_STRICT_TH,
  CHAT_MAX_TOKENS,
  CHAT_SYSTEM,
  chatSystemFor,
} from "../../src/llm/chat-system";
import { acceptGroundedChat, groundingCard } from "../../src/llm/chat-ground";
import { DEFAULT_CHAT_CHOICE_JSON, defaultChatReply } from "../../src/llm/chat-choice";
import { splitCardSentences } from "../../src/llm/chat-sentences";
import { CHAT_FOLLOWUPS_TH, CHAT_OPENERS_TH } from "../../src/llm/chat-voice";

const pool = BANK.filter((c) => shippable(c, "draft") && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
const leak = BANK.find((c) => c.id === "condom.leak.000")!;
const condom = BANK.find((c) => c.id === "condom.000")!;

describe("grounded system prompt", () => {
  it("keeps the ungrounded persona byte-identical", () => {
    expect(chatSystemFor("th")).toBe(CHAT_SYSTEM);
    expect(chatSystemFor("en")).not.toBe(CHAT_SYSTEM);
  });

  it("CHAT_MAX_TOKENS stays 40", () => {
    expect(CHAT_MAX_TOKENS).toBe(40);
  });

  it("ENGLISH_MODEL_CHAT stays false", () => {
    expect(ENGLISH_MODEL_CHAT).toBe(false);
  });

  it("injects the approved card as numbered sentences, the only allowed source", () => {
    const prompt = chatSystemFor("th", { grounding: { facts: leak.answer_th } });
    expect(prompt.startsWith(CHAT_SYSTEM)).toBe(true);
    expect(prompt).toContain(CHAT_GROUND_FACTS_TH);
    for (const s of splitCardSentences(leak.answer_th)) {
      expect(prompt).toContain(s);
    }
    expect(prompt).toContain('{"o":N,"s":[...],"q":N}');
    expect(prompt).toContain(CHAT_OPENERS_TH[0]!);
    expect(prompt).toContain(CHAT_FOLLOWUPS_TH[0]!);
  });

  it("with no card, JSON ids only and s must be empty", () => {
    const prompt = chatSystemFor("th", { grounding: { facts: null } });
    expect(prompt).toContain(CHAT_GROUND_NONE_TH);
    expect(prompt).toContain('"s":[]');
    expect(prompt).not.toContain(leak.answer_th);
    expect(prompt).not.toMatch(/ขอข้อมูลเลย/);
  });

  it("strict retry appends the stricter line", () => {
    const prompt = chatSystemFor("th", { grounding: { facts: leak.answer_th, strict: true } });
    expect(prompt).toContain(CHAT_GROUND_STRICT_TH);
  });

  it("prompt templates never invent hotlines, EC prices, OSCC hours, or s.133", () => {
    const blob = [
      CHAT_SYSTEM, CHAT_GROUND_FACTS_TH, CHAT_GROUND_NONE_TH, CHAT_GROUND_STRICT_TH,
      chatSystemFor("th", { grounding: { facts: leak.answer_th } }),
    ].join("\n");
    expect(blob).not.toMatch(/1663|1300|191/);
    expect(blob).not.toMatch(/มาตรา\s*133|ส\.?\s*133/i);
    expect(blob).not.toMatch(/ยาคุมฉุกเฉิน[\s\S]{0,40}บาท/);
  });
});

describe("groundingCard (rules matcher top card)", () => {
  it("returns the confident leak card for ถุงยางแตก", () => {
    const r = retrieve("ถุงยางแตกทำไงดี", pool);
    expect(r.confident).toBe(true);
    expect(groundingCard(r)?.id).toBe("condom.leak.000");
  });

  it("returns null when nothing matches well enough", () => {
    const r = retrieve("ขอสูตรเค้กช็อกโกแลตที่ไม่มีในคลัง", pool);
    expect(groundingCard(r)).toBeNull();
  });

  it("does not return an 18+ card for unverified or underage context (Codex MEDIUM 6)", () => {
    const adult = BANK_FIXTURES.find((c) => c.id === "other.adult_only.000")!;
    const withAdult = [...pool, adult];
    const r = retrieve("เนื้อหาทดสอบสิบแปดบวก", withAdult);
    expect(r.confident).toBe(true);
    expect(r.ranked[0]?.card.id).toBe("other.adult_only.000");
    expect(groundingCard(r)).toBeNull();
    expect(groundingCard(r, "15-17")).toBeNull();
    expect(groundingCard(r, "unspecified")).toBeNull();
    expect(groundingCard(r, null)).toBeNull();
    expect(groundingCard(r, "18-24")?.id).toBe("other.adult_only.000");
    expect(groundingCard(r, "25+")?.id).toBe("other.adult_only.000");
    expect(groundingCard(r, "18+")?.id).toBe("other.adult_only.000");
  });
});

describe("acceptGroundedChat (strict JSON + chatGuard on voice)", () => {
  it("accepts the default no-sentence choice and renders opener plus follow-up", () => {
    const acc = acceptGroundedChat(DEFAULT_CHAT_CHOICE_JSON, "th", leak.answer_th);
    expect(acc).toEqual({ ok: true, text: defaultChatReply("th") });
  });

  it("copies chosen card sentences verbatim, including digits that live on the card", () => {
    const sentences = splitCardSentences(condom.answer_th);
    const acc = acceptGroundedChat('{"o":0,"s":[0],"q":0}', "th", condom.answer_th);
    expect(acc.ok).toBe(true);
    if (acc.ok) {
      expect(acc.text.startsWith(CHAT_OPENERS_TH[0]!)).toBe(true);
      expect(acc.text.endsWith(CHAT_FOLLOWUPS_TH[0]!)).toBe(true);
      expect(acc.text).toContain(sentences[0]!);
      expect(acc.text).toContain("98%");
    }
  });

  it("rejects an incomplete free-text reply as invalid", () => {
    const acc = acceptGroundedChat("น้องเล่าเพิ่", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toContain("invalid");
  });

  it("rejects a mid-word cut-off as invalid (no trim leftover)", () => {
    const acc = acceptGroundedChat("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toContain("invalid");
  });

  it("rejects a particle-only leftover as invalid", () => {
    const acc = acceptGroundedChat("ค่ะ เรื่องแฟนนี่พี่เข้าใจ", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toContain("invalid");
  });

  it("rejects free-text digits as invalid JSON, not as a loosened guard", () => {
    const acc = acceptGroundedChat("กันท้องได้ 98% เลย", "th", condom.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toContain("invalid");
  });

  it("rejects the heat-a-broken-condom line", () => {
    const acc = acceptGroundedChat("ถุงยางแตกแล้วให้นำไปอุ่นก่อนใช้นะ", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toEqual(["invalid"]);
  });

  it("rejects bad JSON, out-of-range ids, duplicate ids, extra keys, and ids with no card", () => {
    expect(acceptGroundedChat("{", "th", condom.answer_th).ok).toBe(false);
    expect(acceptGroundedChat('{"o":0,"s":[9],"q":0}', "th", condom.answer_th).ok).toBe(false);
    expect(acceptGroundedChat('{"o":0,"s":[0,0],"q":0}', "th", condom.answer_th).ok).toBe(false);
    expect(acceptGroundedChat('{"o":0,"s":[],"q":0,"text":"x"}', "th", condom.answer_th).ok).toBe(false);
    expect(acceptGroundedChat('{"o":0,"s":[0],"q":0}', "th", "").ok).toBe(false);
  });
});
