import { describe, expect, it } from "vitest";
import { detectChatLang, latinLetterShare, mostlyLatin } from "../../src/llm/chat-lang";

describe("detectChatLang (rules, per turn)", () => {
  it("treats Thai as the default", () => {
    expect(detectChatLang("อยากรู้เรื่องคุมกำเนิด")).toBe("th");
    expect(detectChatLang("")).toBe("th");
    expect(detectChatLang("🙂")).toBe("th");
  });

  it("is English only when ≥60% of letters are Latin and there are at least 2 English words", () => {
    expect(detectChatLang("I want birth control")).toBe("en");
    expect(detectChatLang("Just show me the info")).toBe("en");
    expect(detectChatLang("hello there")).toBe("en");
    expect(detectChatLang("Can you help me with emergency contraception")).toBe("en");
  });

  it("stays Thai with one English word, even if the letters are Latin", () => {
    expect(detectChatLang("hello")).toBe("th");
    expect(detectChatLang("ok")).toBe("th");
    expect(latinLetterShare("hello")).toBe(1);
  });

  it("stays Thai when Latin letters are under 60%", () => {
    expect(detectChatLang("อยากได้ help please เรื่องนี้")).toBe("th");
    expect(latinLetterShare("อยากได้ help please เรื่องนี้")).toBeLessThan(0.6);
  });

  it("does no other mixed-language detection: two English words and 60% Latin is English, else Thai", () => {
    expect(detectChatLang("I want ยา")).toBe("en");
    expect(detectChatLang("อยากรู้เรื่องคุมกำเนิด about this")).toBe("th");
  });

  it("re-evaluates each call independently", () => {
    expect(detectChatLang("ช่วงนี้กังวลเรื่องแฟน")).toBe("th");
    expect(detectChatLang("I am worried about my boyfriend")).toBe("en");
    expect(detectChatLang("แล้วหนูควรพูดยังไงดี")).toBe("th");
  });

  it("mostlyLatin is the 60% rule without a word minimum", () => {
    expect(mostlyLatin("I'm here.")).toBe(true);
    expect(mostlyLatin("พี่อยู่ตรงนี้นะ")).toBe(false);
  });
});
