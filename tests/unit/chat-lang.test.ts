import { describe, expect, it } from "vitest";
import {
  HEALTH_LOANWORDS,
  MIN_LETTERS_FOR_SCRIPT,
  THAI_SHARE_MODEL_CHAT,
  detectChatLang,
  latinLetterShare,
  modelChatScript,
  mostlyLatin,
} from "../../src/llm/chat-lang";

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

describe("modelChatScript (allowlist loanwords; any other Latin is not Thai chat)", () => {
  it("exports a short whole-word health loanword allowlist", () => {
    expect([...HEALTH_LOANWORDS]).toEqual([
      "hiv", "prep", "pep", "condom", "condoms", "sti", "stis", "std", "stds",
      "hpv", "ec", "iud", "iuds", "rsa",
    ]);
  });

  it("treats ≥60% Latin letters as English, even with fewer than 2 English-list words", () => {
    expect(MIN_LETTERS_FOR_SCRIPT).toBe(2);
    expect(THAI_SHARE_MODEL_CHAT).toBe(0.6);
    expect(modelChatScript("I'm suicidal")).toBe("en");
    expect(modelChatScript("Suicidal")).toBe("en");
    expect(modelChatScript("help")).toBe("en");
    expect(modelChatScript("HELP")).toBe("en");
    expect(detectChatLang("I'm suicidal")).toBe("th");
    expect(detectChatLang("help")).toBe("th");
  });

  it("treats pure Thai as Thai chat", () => {
    expect(modelChatScript("กินยาคุมยังไง")).toBe("th");
  });

  it("treats Thai plus an allowlisted health loanword as Thai chat", () => {
    expect(modelChatScript("อยากตรวจ HIV ค่ะ")).toBe("th");
    expect(modelChatScript("กิน PrEP ยังไง")).toBe("th");
    expect(modelChatScript("ตรวจ HIV ที่ไหนดี")).toBe("th");
    expect(modelChatScript("กิน PrEP ยังไงคะ")).toBe("th");
    expect(modelChatScript("ใช้ condom ยังไง")).toBe("th");
    expect(modelChatScript("กิน PrEP")).toBe("th");
    expect(modelChatScript("ตรวจ HIV")).toBe("th");
    expect(latinLetterShare("อยากตรวจ HIV ค่ะ")).toBeLessThan(0.6);
    expect(latinLetterShare("กิน PrEP ยังไง")).toBeLessThan(0.6);
  });

  it("does not treat mostly-Thai lines with a non-allowlisted English word as Thai chat", () => {
    expect(modelChatScript("หนูอยาก die ค่ะ")).toBe("mixed");
    expect(modelChatScript("หนูคิดจะ kms คืนนี้")).toBe("mixed");
    expect(modelChatScript("หนูรู้สึก suicidal มาหลายวันแล้ว")).toBe("mixed");
    expect(modelChatScript("แฟน abuse หนูทุกวัน")).toBe("mixed");
    expect(modelChatScript("หนู cut ตัวเองทุกคืนค่ะ")).toBe("mixed");
    expect(modelChatScript("อยาก unalive ตัวเองค่ะ")).toBe("mixed");
    expect(modelChatScript("อยากรู้เรื่อง prepare ค่ะ")).toBe("mixed");
  });

  it("treats mixed script (Thai share between 40% and 60%) as mixed", () => {
    expect(modelChatScript("อยากตาย hi there")).toBe("mixed");
    expect(modelChatScript("ถูกทำร้าย badly hurt")).toBe("mixed");
    expect(modelChatScript("cutting เจ็บที่แขน")).toBe("mixed");
  });

  it("treats no letters, a single letter, emoji, digits, and punctuation as mixed/unclear", () => {
    expect(modelChatScript("😭")).toBe("mixed");
    expect(modelChatScript("😭😭😭")).toBe("mixed");
    expect(modelChatScript("...")).toBe("mixed");
    expect(modelChatScript("?")).toBe("mixed");
    expect(modelChatScript("a")).toBe("mixed");
    expect(modelChatScript("12345")).toBe("mixed");
    expect(modelChatScript("")).toBe("mixed");
  });
});
