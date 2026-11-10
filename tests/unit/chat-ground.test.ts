import { describe, expect, it } from "vitest";
import { ENGLISH_MODEL_CHAT } from "../../src/config";
import { BANK, BANK_FIXTURES } from "../../src/core/bankData";
import { retrieve, type Retrieval } from "../../src/core/retrieve";
import { FALLBACK_ID, WELCOME_ID } from "../../src/core/dialog";
import { shippable } from "../../src/core/bank";
import {
  CHAT_MAX_TOKENS,
  CHAT_RETRY_TH,
  CHAT_SYSTEM,
  chatSystemFor,
} from "../../src/llm/chat-system";
import { acceptGroundedChat, groundingCard } from "../../src/llm/chat-ground";
import { STUB_CHAT_REPLY_TH } from "../../src/llm/runtime";
import { CHAT_OPENERS_TH } from "../../src/llm/chat-voice";

const pool = BANK.filter((c) => shippable(c, "draft") && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
const leak = BANK.find((c) => c.id === "condom.leak.000")!;
const condom = BANK.find((c) => c.id === "condom.000")!;

describe("grounded system prompt", () => {
  it("keeps the ungrounded persona byte-identical", () => {
    expect(chatSystemFor("th")).toBe(CHAT_SYSTEM);
    expect(chatSystemFor("en")).not.toBe(CHAT_SYSTEM);
  });

  it("CHAT_MAX_TOKENS is 128 (two short sentences plus a margin)", () => {
    expect(CHAT_MAX_TOKENS).toBe(128);
  });

  it("ENGLISH_MODEL_CHAT stays false", () => {
    expect(ENGLISH_MODEL_CHAT).toBe(false);
  });

  it("does not inject opener lists or card facts into the persona", () => {
    const prompt = chatSystemFor("th", { grounding: { facts: leak.answer_th } });
    expect(prompt).toBe(CHAT_SYSTEM);
    expect(prompt).not.toContain(leak.answer_th);
    expect(prompt).not.toContain(CHAT_OPENERS_TH[0]!);
    expect(prompt).not.toContain('{"o":');
  });

  it("strict retry appends the free-text retry line", () => {
    const prompt = chatSystemFor("th", { grounding: { facts: null, strict: true } });
    expect(prompt).toContain(CHAT_RETRY_TH);
    expect(prompt.startsWith(CHAT_SYSTEM)).toBe(true);
  });

  it("prompt templates never invent hotlines, EC prices, OSCC hours, or s.133", () => {
    const blob = [CHAT_SYSTEM, CHAT_RETRY_TH, chatSystemFor("th", { grounding: { facts: leak.answer_th, strict: true } })].join("\n");
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

  it("does not return a locked card even if retrieval is confident", () => {
    const card = BANK.find((c) => c.id === "ec.timing.b001")!;
    const retrieved: Retrieval = {
      confident: true,
      ranked: [{ card, score: 10, triggerHits: 2 }],
      prior: { intents: ["emergency_contraception"], scores: {}, source: "rules" },
    };
    expect(groundingCard(retrieved)).toBeNull();
  });
});

describe("acceptGroundedChat (chatGuard on free text)", () => {
  it("accepts a guard-safe model line and does not quote the card", () => {
    const acc = acceptGroundedChat(STUB_CHAT_REPLY_TH, "th", leak.answer_th);
    expect(acc).toEqual({ ok: true, text: STUB_CHAT_REPLY_TH });
  });

  it("accepts free-text digits in a grounded Thai line", () => {
    const acc = acceptGroundedChat("กันท้องได้ 98% เลย", "th", condom.answer_th);
    expect(acc).toEqual({ ok: true, text: "กันท้องได้ 98% เลย" });
  });

  it("rejects a URL / claim line", () => {
    const acc = acceptGroundedChat("กิน 2 เม็ด แล้วไม่ท้องแน่ https://evil.test", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
  });

  it("rejects JSON leftovers that are not Thai chat", () => {
    expect(acceptGroundedChat('{"o":0,"c":0,"q":0}', "th", condom.answer_th).ok).toBe(false);
  });
});
