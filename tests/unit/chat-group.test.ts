import { describe, expect, it } from "vitest";
import {
  ACK_LINE_TH,
  ACK_LINE_TH_STATUS,
  combineUnanswered,
  countedGroupMessages,
  dropAckLines,
  groupReplyLang,
  groupTakesNoModelPath,
  isAckLine,
  isEmojiOnly,
} from "../../src/core/chat-group";

describe("isAckLine", () => {
  it("treats thanks and short particles as ack, not topic lines", () => {
    expect(isAckLine("ขอบคุณค่ะ")).toBe(true);
    expect(isAckLine("ขอบคุณครับ")).toBe(true);
    expect(isAckLine("thanks")).toBe(true);
    expect(isAckLine("thank you")).toBe(true);
    expect(isAckLine("ok")).toBe(true);
    expect(isAckLine("โอเค")).toBe(true);
    expect(isAckLine("ถุงยางแตกต้องทำยังไง")).toBe(false);
    expect(isAckLine("ช่วงนี้กังวลเรื่องแฟน")).toBe(false);
    expect(isAckLine("แล้วหนูควรพูดยังไงดี")).toBe(false);
  });

  it("drops whole-line acks and keeps the remaining topic lines", () => {
    expect(dropAckLines(["ยาคุมฉุกเฉินกินเมื่อไร", "ขอบคุณค่ะ"])).toEqual(["ยาคุมฉุกเฉินกินเมื่อไร"]);
    expect(dropAckLines(["thanks", "ok", "thank you"])).toEqual([]);
    expect(dropAckLines(["ช่วงนี้กังวลเรื่องแฟน"])).toEqual(["ช่วงนี้กังวลเรื่องแฟน"]);
  });

  it("exports a one-line DRAFT Thai acknowledgement", () => {
    expect(ACK_LINE_TH_STATUS).toBe("draft");
    expect(ACK_LINE_TH.includes("\n")).toBe(false);
    expect(ACK_LINE_TH.length).toBeGreaterThan(0);
  });
});

describe("isEmojiOnly", () => {
  it("treats emoji-only lines as emoji and letter lines as not", () => {
    expect(isEmojiOnly("😭")).toBe(true);
    expect(isEmojiOnly("😭😭😭")).toBe(true);
    expect(isEmojiOnly("...")).toBe(false);
    expect(isEmojiOnly("?")).toBe(false);
    expect(isEmojiOnly("a")).toBe(false);
    expect(isEmojiOnly("12345")).toBe(false);
    expect(isEmojiOnly("ช่วงนี้กังวลเรื่องแฟน")).toBe(false);
    expect(isEmojiOnly("")).toBe(false);
  });
});

describe("group script gate", () => {
  it("joins unanswered messages with newlines", () => {
    expect(combineUnanswered(["กังวลเรื่องแฟน", "แฟนไม่ยอมคุยด้วย"])).toBe("กังวลเรื่องแฟน\nแฟนไม่ยอมคุยด้วย");
  });

  it("emoji-only messages do not count either way", () => {
    expect(countedGroupMessages(["😭", "ช่วงนี้กังวลเรื่องแฟน"])).toEqual(["ช่วงนี้กังวลเรื่องแฟน"]);
    expect(groupTakesNoModelPath(["😭"], false)).toBe(false);
    expect(groupTakesNoModelPath(["😭", "ช่วงนี้กังวลเรื่องแฟน"], false)).toBe(false);
  });

  it("any counted no-model message makes the group take the card path", () => {
    expect(groupTakesNoModelPath(["ช่วงนี้กังวลเรื่องแฟน"], false)).toBe(false);
    expect(groupTakesNoModelPath(["I want to know about birth control"], false)).toBe(true);
    expect(groupTakesNoModelPath(["ช่วงนี้กังวลเรื่องแฟน", "I want to know about birth control"], false)).toBe(true);
    expect(groupTakesNoModelPath(["I want to know about birth control"], true)).toBe(false);
    expect(groupTakesNoModelPath(["อยากรู้เรื่อง prepare ค่ะ"], false)).toBe(true);
  });

  it("mixed leftover Latin takes the card path unless allowMixed is set; English stays off", () => {
    expect(groupTakesNoModelPath(["ยาคุมทำให้รู้สึก suicidal ได้ไหม"], false)).toBe(true);
    expect(groupTakesNoModelPath(["ยาคุมทำให้รู้สึก suicidal ได้ไหม"], false, true)).toBe(false);
    expect(groupTakesNoModelPath(["ช่วงนี้กังวลเรื่องแฟน", "ยาคุมทำให้รู้สึก suicidal ได้ไหม"], false, true)).toBe(false);
    expect(groupTakesNoModelPath(["I don't want to live in fear of HIV"], false, true)).toBe(true);
  });

  it("reply language follows counted messages", () => {
    expect(groupReplyLang(["ช่วงนี้กังวลเรื่องแฟน", "😭"])).toBe("th");
    expect(groupReplyLang(["I am worried about my boyfriend"])).toBe("en");
  });
});
