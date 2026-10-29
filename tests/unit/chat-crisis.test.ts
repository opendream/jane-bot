import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EN_RULES,
  TH_F_ID,
  TH_RULES,
  bareFollowupInContext,
  chatCrisisLog,
  detectChatCrisis,
  detectChatCrisisForTurn,
  isBareFollowup,
  noteChatCrisisHit,
  resetChatCrisisLog,
} from "../../src/core/chat-crisis";
import { detectCrisis } from "../../src/core/crisis";
import { CHAT_CRISIS_CARD_FIRST, chatCrisisEnabled } from "../../src/config";

// SYNTHETIC paraphrases only. Probe ids in comments; original texts stay off-repo.

/** Thai banana-v2 / Dialogflow paraphrases the extra check must catch. */
const TH_PROBES: { id: string; text: string; rule: string; cat: "sexual_violence" | "violence_danger" }[] = [
  { id: "bt483", text: "เขาจับตัวฉัน ฉันไม่ชอบเลย", rule: "TH-B unwanted touch", cat: "sexual_violence" },
  { id: "bt494", text: "หนูโทษตัวเองกับเรื่องที่เกิด", rule: "TH-C1 self-blame for event", cat: "sexual_violence" },
  { id: "bt495", text: "ไม่มีใครเชื่อว่าหนูถูกคุกคาม", rule: "TH-A1 first-person harassed", cat: "sexual_violence" },
  { id: "bt496", text: "การคุกคามของฉันไม่มีใครฟัง", rule: "TH-A2 my harassment", cat: "sexual_violence" },
  { id: "bt499", text: "ฉันรู้สึกผิดที่ไม่ได้เล่าเรื่องนี้", rule: "TH-C2 guilt not telling", cat: "sexual_violence" },
  { id: "bt513", text: "กลัวไปโรงเรียนเพราะพฤติกรรมของเขา", rule: "TH-D fear from behaviour", cat: "violence_danger" },
  { id: "bt530", text: "อยากเล่าเรื่องที่ถูกคุกคามให้เพื่อนฟัง", rule: "TH-A3 telling about harassment", cat: "sexual_violence" },
  { id: "bt532", text: "หนูถูกคุกคามที่ทำงาน", rule: "TH-A1 first-person harassed", cat: "sexual_violence" },
  { id: "bt534", text: "เราโดนเขาทางเพศคุกคาม", rule: "TH-A1 first-person harassed", cat: "sexual_violence" },
  { id: "bt536", text: "ผมถูกคุกคามแล้วเขาว่าคิดไปเอง", rule: "TH-A1 first-person harassed", cat: "sexual_violence" },
  { id: "bt537", text: "เขาโทษหนูที่ถูกคุกคาม", rule: "TH-C3 victim blamed", cat: "sexual_violence" },
  { id: "de90", text: "แฟนซ้อม", rule: "TH-E1 relation + violent verb", cat: "violence_danger" },
  { id: "de92", text: "ผัวใช้กำลัง", rule: "TH-E1 relation + violent verb", cat: "violence_danger" },
  { id: "de93", text: "โดนซ้อม", rule: "TH-E2 victim + beaten/forced", cat: "violence_danger" },
  { id: "de94", text: "พ่อข่วน", rule: "TH-E1 relation + violent verb", cat: "violence_danger" },
  { id: "de95", text: "สามีชอบซ้อม", rule: "TH-E1 relation + violent verb", cat: "violence_danger" },
  { id: "de97", text: "โดนแฟนใช้กำลัง", rule: "TH-E2 victim + beaten/forced", cat: "violence_danger" },
  { id: "de99", text: "แม่มักข่วน", rule: "TH-E1 relation + violent verb", cat: "violence_danger" },
];

const EN_PROBES: { id: string; text: string; rule: string; cat: "sexual_violence" | "violence_danger" }[] = [
  { id: "bt483-en", text: "he touched me and I don't like it", rule: "EN-B unwanted touch", cat: "sexual_violence" },
  { id: "bt494-en", text: "I keep blaming myself for what happened", rule: "EN-C1 self-blame for event", cat: "sexual_violence" },
  { id: "bt495-en", text: "nobody believes me about the harassment", rule: "EN-A1 not believed/dismissed about harassment", cat: "sexual_violence" },
  { id: "bt496-en", text: "they shrugged off my concerns about harassment", rule: "EN-A2 my concerns about harassment", cat: "sexual_violence" },
  { id: "bt499-en", text: "I feel guilty about not speaking up", rule: "EN-C2 guilt about not speaking up", cat: "sexual_violence" },
  { id: "bt513-en", text: "I'm afraid to go back because of someone's behaviour", rule: "EN-D fear from behaviour", cat: "violence_danger" },
  { id: "bt530-en", text: "the harassment that I experienced still scares me", rule: "EN-A3 harassment I experienced / I was harassed", cat: "sexual_violence" },
  { id: "bt532-en", text: "I was sexually harassed at work", rule: "EN-A3 harassment I experienced / I was harassed", cat: "sexual_violence" },
  { id: "bt534-en", text: "I'm scared to tell anyone about the harassment", rule: "EN-A4 scared to tell about harassment", cat: "sexual_violence" },
  { id: "bt536-en", text: "I keep getting harassed on the way home", rule: "EN-A3 harassment I experienced / I was harassed", cat: "sexual_violence" },
  { id: "bt537-en", text: "she isn't believing me about sexual harassment", rule: "EN-A1 not believed/dismissed about harassment", cat: "sexual_violence" },
];

const EN_E_SYNTHETIC = [
  "my boyfriend hits me",
  "my husband beats me",
  "my partner uses force on me",
  "I keep getting beaten",
];

const FP_NORMAL_TH = [
  "อยากกินยาคุม",
  "ยาคุมฉุกเฉินกินเมื่อไร",
  "ถุงยางแตกทำไงดี",
  "อยากตรวจเอชไอวี",
  "เพร็พคืออะไร",
  "ประจำเดือนมาช้า",
  "แฟนกดดันให้มีเซ็กส์",
];

const FP_NORMAL_EN = [
  "how does contraception work",
  "when should I take emergency contraception",
  "the condom broke what now",
  "where can I get an HIV test",
  "what is PrEP",
  "my period is late",
  "how do I talk about the relationship",
  "I want to know about birth control",
  "I don't want to live with my parents",
  "what is forced sex",
];

const FP_SHORT_PV_HARASS = [
  "โดนแฟนตี",
  "แฟนทำร้าย",
  "ความรุนแรงในครอบครัว",
  "ถูกคุกคาม",
  "ลวนลามคืออะไร",
  "domestic violence",
  "my partner is violent",
  "what is sexual harassment",
  "street harassment",
];

const FP_TI_IDIOMS = [
  "ตีความยังไง",
  "อยากตีสนิทกับเพื่อน",
  "ตีสองแล้ว",
  "ตีกลองในวง",
  "ตีราคาเท่าไหร่",
  "ตีพิมพ์บทความ",
  "ตีระฆังวัด",
  "ตีไข่ใส่กระทะ",
  "แฟนซ้อมบอล",
  "พี่ชายซ้อมดนตรี",
];

beforeEach(() => resetChatCrisisLog());
afterEach(() => resetChatCrisisLog());

describe("named rule lists", () => {
  it("has 10 Thai rules, 11 English rules, plus the context rule id", () => {
    expect(TH_RULES).toHaveLength(10);
    expect(EN_RULES).toHaveLength(11);
    expect(TH_F_ID).toBe("TH-F bare follow-up after violence cue");
  });
});

describe("Thai synthetic paraphrases (keyed to probe ids)", () => {
  it.each(TH_PROBES)("$id matches $rule and is missed by the pin", ({ text, rule, cat }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.rules, text).toContain(rule);
    expect(hit.categories, text).toContain(cat);
  });
});

describe("English synthetic paraphrases (keyed to probe ids)", () => {
  it.each(EN_PROBES)("$id matches $rule and is missed by the pin", ({ text, rule, cat }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.rules, text).toContain(rule);
    expect(hit.categories, text).toContain(cat);
  });
});

describe("EN-E partner/family hits me (synthetic; no English probe)", () => {
  it.each(EN_E_SYNTHETIC)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.rules).toContain("EN-E partner/family hits me");
    expect(hit.categories).toContain("violence_danger");
  });
});

describe("EN-F forced sex and EN-G don't want to live (synthetic disclosures)", () => {
  it("I was forced to have sex", () => {
    const text = "I was forced to have sex";
    expect(detectCrisis(text).crisis).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis).toBe(true);
    expect(hit.rules).toContain("EN-F forced sex");
    expect(hit.categories).toContain("sexual_violence");
  });
  it("I don't want to live anymore", () => {
    const text = "I don't want to live anymore";
    expect(detectCrisis(text).crisis).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis).toBe(true);
    expect(hit.rules).toContain("EN-G don't want to live");
    expect(hit.categories).toContain("self_harm");
  });
  it("I feel like I cannot go on living", () => {
    const text = "I feel like I cannot go on living";
    expect(detectCrisis(text).crisis).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis).toBe(true);
    expect(hit.rules).toContain("EN-G don't want to live");
  });
});

describe("de88 two-turn bare follow-up (TH-F)", () => {
  const cue = "แฟนทำร้าย";
  const follow = "ต้องทำไงดี";

  it("is a bare follow-up and the cue alone does not fire", () => {
    expect(isBareFollowup(follow)).toBe(true);
    expect(detectChatCrisis(cue).crisis).toBe(false);
    expect(detectChatCrisis(follow).crisis).toBe(false);
    expect(bareFollowupInContext(follow, [])).toBe(false);
  });

  it("fires only when a previous 1–2 user lines carry a violence/harassment cue", () => {
    expect(detectChatCrisisForTurn(follow, [cue]).crisis).toBe(true);
    expect(detectChatCrisisForTurn(follow, [cue]).rules).toContain(TH_F_ID);
    expect(detectChatCrisisForTurn(follow, ["อยากกินยาคุม"]).crisis).toBe(false);
    expect(detectChatCrisisForTurn(follow, ["ตีความยังไง"]).crisis).toBe(false);
  });
});

describe("false positives: normal SRH, short IPV/harassment, ตี idioms", () => {
  it.each(FP_NORMAL_TH)("Thai SRH %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
  it.each(FP_NORMAL_EN)("English SRH %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
  it.each(FP_SHORT_PV_HARASS)("short IPV/harassment stays on its card: %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
  it.each(FP_TI_IDIOMS)("ตี/ซ้อม idiom %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn("ต้องทำไงดี", [text]).crisis, text).toBe(false);
  });
});

describe("dev/eval in-memory reason tag", () => {
  it("records chat-crisis with rule ids and never stores user text", () => {
    expect(chatCrisisLog()).toBeNull();
    noteChatCrisisHit(["TH-A1 first-person harassed"]);
    const log = chatCrisisLog();
    expect(log).toEqual({ reason: "chat-crisis", rules: ["TH-A1 first-person harassed"] });
    expect(log).not.toHaveProperty("text");
    expect(JSON.stringify(log)).not.toContain("หนู");
  });
});

describe("card-first switch is on", () => {
  it("CHAT_CRISIS_CARD_FIRST is true so both paths run the extra check", () => {
    expect(CHAT_CRISIS_CARD_FIRST).toBe(true);
    expect(chatCrisisEnabled(false)).toBe(true);
    expect(chatCrisisEnabled(true)).toBe(true);
  });
});
