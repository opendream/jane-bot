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

const pool = BANK.filter((c) => shippable(c, "draft") && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
const leak = BANK.find((c) => c.id === "condom.leak.000")!;

describe("grounded system prompt", () => {
  it("keeps the ungrounded persona byte-identical", () => {
    expect(chatSystemFor("th")).toBe(CHAT_SYSTEM);
    expect(chatSystemFor("en")).not.toBe(CHAT_SYSTEM);
  });

  it("CHAT_MAX_TOKENS stays 80", () => {
    expect(CHAT_MAX_TOKENS).toBe(80);
  });

  it("ENGLISH_MODEL_CHAT stays false", () => {
    expect(ENGLISH_MODEL_CHAT).toBe(false);
  });

  it("injects the approved card as the only allowed source", () => {
    const prompt = chatSystemFor("th", { grounding: { facts: leak.answer_th } });
    expect(prompt.startsWith(CHAT_SYSTEM)).toBe(true);
    expect(prompt).toContain(CHAT_GROUND_FACTS_TH);
    expect(prompt).toContain(leak.answer_th);
    expect(prompt).toContain("ยังไม่ทราบ");
  });

  it("with no card, only a short warm no-fact reply pointing at ขอข้อมูลเลย", () => {
    const prompt = chatSystemFor("th", { grounding: { facts: null } });
    expect(prompt).toContain(CHAT_GROUND_NONE_TH);
    expect(prompt).toContain("ขอข้อมูลเลย");
    expect(prompt).not.toContain(leak.answer_th);
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

describe("acceptGroundedChat (trim + guard + fact check)", () => {
  it("trims a mid-word cut-off and keeps the complete sentence", () => {
    const acc = acceptGroundedChat("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่", "th", leak.answer_th);
    expect(acc).toEqual({ ok: true, text: "พี่อยู่ตรงนี้นะ" });
  });

  it("rejects an incomplete reply", () => {
    const acc = acceptGroundedChat("น้องเล่าเพิ่", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toContain("incomplete");
  });

  it("rejects a particle-only trim leftover as incomplete", () => {
    const acc = acceptGroundedChat("ค่ะ เรื่องแฟนนี่พี่เข้าใจ", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toContain("incomplete");
  });

  it("still applies chatGuard (digits are not loosened even if the card has them)", () => {
    const acc = acceptGroundedChat("กันท้องได้ 98% เลย", "th", BANK.find((c) => c.id === "condom.000")!.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons).toContain("digits");
  });

  it("rejects the heat-a-broken-condom line", () => {
    const acc = acceptGroundedChat("ถุงยางแตกแล้วให้นำไปอุ่นก่อนใช้นะ", "th", leak.answer_th);
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.reasons.length).toBeGreaterThan(0);
  });
});
