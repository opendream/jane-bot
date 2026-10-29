import { describe, expect, it } from "vitest";
import {
  combineUnanswered,
  countedGroupMessages,
  groupReplyLang,
  groupTakesNoModelPath,
  isEmojiOnly,
} from "../../src/core/chat-group";

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

  it("reply language follows counted messages", () => {
    expect(groupReplyLang(["ช่วงนี้กังวลเรื่องแฟน", "😭"])).toBe("th");
    expect(groupReplyLang(["I am worried about my boyfriend"])).toBe("en");
  });
});
