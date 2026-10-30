import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "../../src/config";
import { ACK_LINE_TH } from "../../src/core/chat-group";
import { AMBIGUOUS_CRISIS_LINE_TH } from "../../src/core/chat-crisis";
import { QUIZ_WRAP } from "../../src/core/quiz";
import { REFUSAL_CARDS } from "../../src/core/guard";
import { CHAT_FOLLOWUPS_TH, CHAT_OPENERS_TH } from "../../src/llm/chat-voice";
import { CHAT_SYSTEM } from "../../src/llm/chat-system";
import { CHAT_THINKING_PHRASES } from "../../src/ui/chat-thinking";
import { JANE_IMAGES } from "../../src/ui/jane";
import { READINESS_LINE, THINKING_HINTS } from "../../src/ui/thinking";

const REMOVED = [
  "ทางนี้พี่เข้าใจ",
  "อยากให้พี่ส่งข้อมูลที่ตรวจแล้วไหม?",
  "พี่ฟังอยู่นะ ขอส่งข้อมูลที่ตรวจแล้วให้ก่อน",
  "น้องอยากเล่าเพิ่มไหม?",
  "น้องอยากให้ช่วยตรงไหนก่อน?",
  "พี่อยู่ตรงนี้นะ",
  "เรื่องนี้พี่ช่วยไม่ได้",
] as const;

const SHIPPED_TH = [
  ...CHAT_OPENERS_TH,
  ...CHAT_FOLLOWUPS_TH,
  ACK_LINE_TH,
  AMBIGUOUS_CRISIS_LINE_TH,
  ...Object.values(REFUSAL_CARDS).map((c) => c.title_th),
  ...Object.values(REFUSAL_CARDS).map((c) => c.answer_th),
];

const UI_CONSTANTS = [
  PRODUCT_NAME,
  ...THINKING_HINTS.map((h) => h.text),
  READINESS_LINE,
  CHAT_THINKING_PHRASES.th[0],
  CHAT_THINKING_PHRASES.label.th,
  QUIZ_WRAP,
  CHAT_SYSTEM,
  ...Object.values(JANE_IMAGES).map((img) => img.alt),
];

describe("Keng เรา/เธอ voice + เจน rename", () => {
  it("PRODUCT_NAME is เจน", () => {
    expect(PRODUCT_NAME).toBe("เจน");
  });

  it("shipped Thai openers, follow-ups, ack, ambiguous line, and refusals have no พี่/น้อง pronouns", () => {
    for (const s of SHIPPED_TH.filter((t) => t.length > 0)) {
      expect(s, s).not.toMatch(/พี่|น้อง/);
    }
  });

  it("removed strings are absent from the live lists", () => {
    const live = SHIPPED_TH.join("\n");
    for (const dropped of REMOVED) {
      expect(live).not.toContain(dropped);
    }
    expect(CHAT_OPENERS_TH).toEqual([
      "เราอยู่ตรงนี้นะคะ",
      "เราเข้าใจค่ะ",
      "ขอบคุณที่ถามมานะคะ",
      "เรื่องนี้เราเข้าใจค่ะ",
      "",
    ]);
    expect(CHAT_FOLLOWUPS_TH).toEqual([
      "เธออยากเล่าเพิ่มไหมคะ?",
      "ตอนนี้อยากถามเรื่องไหนต่อดีคะ?",
      "",
      "ยังมีอะไรที่อยากคุยต่อไหมคะ?",
      "เธออยากให้ช่วยตรงไหนก่อนคะ?",
    ]);
  });

  it("no card answer_th/title_th contains พี่เจน (triggers excluded)", () => {
    const dir = "src/data/bank";
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "quiz.json")) {
      const json = JSON.parse(readFileSync(`${dir}/${name}`, "utf8")) as {
        cards?: { id: string; answer_th?: string; title_th?: string }[];
      };
      for (const c of json.cards ?? []) {
        expect(c.answer_th ?? "", `${c.id} answer_th`).not.toContain("พี่เจน");
        expect(c.title_th ?? "", `${c.id} title_th`).not.toContain("พี่เจน");
      }
    }
  });

  it("section 1b UI constants do not contain พี่เจน", () => {
    for (const s of UI_CONSTANTS) {
      expect(s, s).not.toContain("พี่เจน");
    }
  });
});
