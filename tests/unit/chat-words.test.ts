import { describe, expect, it } from "vitest";
import {
  extractNumberSpans,
  hasWordSegmenter,
  numberValues,
  wordList,
} from "../../src/llm/chat-words";

describe("Intl.Segmenter word split", () => {
  it("is available in the test runtime", () => {
    expect(hasWordSegmenter()).toBe(true);
    expect(typeof Intl.Segmenter).toBe("function");
  });

  it("keeps ทาน / ทาง as whole words distinct from ทา", () => {
    expect(wordList("ทานเพร็พไว้ก่อนนะ")).toContain("ทาน");
    expect(wordList("ทานเพร็พไว้ก่อนนะ")).not.toContain("ทา");
    expect(wordList("ทางนี้")).toEqual(["ทาง", "นี้"]);
    expect(wordList("ทางนี้")).not.toContain("ทา");
  });
});

describe("number values in any form", () => {
  it("reads สิบเก้า as 19, not 10 and 9", () => {
    expect(numberValues("อายุสิบเก้าถึงรับเพร็พได้นะ")).toEqual([19]);
    expect(extractNumberSpans("สิบเก้า").map((s) => s.value)).toEqual([19]);
  });

  it("reads สอง, Arabic digits, Thai digits, and English words", () => {
    expect(numberValues("สองขวด")).toEqual([2]);
    expect(numberValues("98%")).toEqual([98]);
    expect(numberValues("๑๙")).toEqual([19]);
    expect(numberValues("nineteen year old")).toEqual([19]);
  });

  it("does not treat a numbered list marker as a quantity on the card", () => {
    expect(numberValues("1. ไซส์ไม่พอดี\n2. ความร้อน")).toEqual([]);
    expect(numberValues("กินวันละ 1 เม็ด")).toEqual([1]);
  });

  it("does not treat สามารถ / เสี่ยง / ห้าม / เพศสัมพันธ์ as number words", () => {
    expect(numberValues("สามารถ")).toEqual([]);
    expect(numberValues("เสี่ยง")).toEqual([]);
    expect(numberValues("ห้าม")).toEqual([]);
    expect(numberValues("เพศสัมพันธ์")).toEqual([]);
    expect(numberValues("เพร็พสามารถลดความเสี่ยงได้")).toEqual([]);
  });

  it("reads สามในสี่ as a fraction, not as สามารถ-style substrings", () => {
    expect(numberValues("สามในสี่")).toEqual([0.75]);
    expect(numberValues("เพร็พลดโอกาสได้สามในสี่ค่ะ")).toEqual([0.75]);
  });
});
