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
import { ROUND4_PRECISION_CARD_LINES } from "./chat-crisis-adversarial-fp";

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
  "help me choose a condom",
  "Can you help me with emergency contraception",
];

/** Thai + SRH loanwords must not fire on English crisis-token word boundaries. */
const FP_TH_LOANWORD = [
  "ตรวจ HIV",
  "กิน PrEP",
  "ใช้ condom ยังไง",
  "อยากตรวจ HIV ค่ะ",
  "กิน PrEP ยังไง",
];

/** Short English lines still on the exact-phrase list (pin misses). */
const EN_SHORT_CRISIS: { text: string; cat: "self_harm" }[] = [
  { text: "I'm suicidal", cat: "self_harm" },
  { text: "wanna die", cat: "self_harm" },
  { text: "end my life", cat: "self_harm" },
  { text: "cutting myself", cat: "self_harm" },
  { text: "I cut myself every night", cat: "self_harm" },
];

/** Short English that used to fire and now stays on the card. */
const EN_SHORT_NOW_CARD = [
  "Suicidal",
  "feeling suicidal",
  "suicidal thoughts",
  "Forced sex",
  "partner hit me",
];

/** Mostly-Thai lines with one English crisis word (Thai letter share ≥ 60%). */
const TH_EN_CRISIS_LOANWORD: { text: string; token: string; cat: "self_harm" | "violence_danger" }[] = [
  { text: "หนูอยาก die ค่ะ", token: "die", cat: "self_harm" },
  { text: "หนูคิดจะ kms คืนนี้", token: "kms", cat: "self_harm" },
  { text: "หนูรู้สึก suicidal มาหลายวันแล้ว", token: "suicidal", cat: "self_harm" },
  { text: "แฟน abuse หนูทุกวัน", token: "abuse", cat: "violence_danger" },
  { text: "หนู cut ตัวเองทุกคืนค่ะ", token: "cut", cat: "self_harm" },
  { text: "อยาก unalive ตัวเองค่ะ", token: "unalive", cat: "self_harm" },
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
  it("has 11 Thai rules, a short English list (mixed Thai tokens + exact phrases), plus the context rule id", () => {
    expect(TH_RULES).toHaveLength(11);
    expect(EN_RULES).toHaveLength(16);
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

describe("English banana paraphrases stay on the card (Thai-only exact list)", () => {
  it.each(EN_PROBES)("$id does not fire the extra check", ({ text }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
});

describe("EN-E partner/family hits me stays on the card (Thai-only exact list)", () => {
  it.each(EN_E_SYNTHETIC)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
});

describe("fuzzy forced-sex English stays on the card", () => {
  it.each([
    "I was forced to have sex",
    "I feel like I cannot go on living",
  ])("%s", (text) => {
    expect(detectCrisis(text).crisis).toBe(false);
    expect(detectChatCrisis(text).crisis).toBe(false);
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
  it.each(FP_TH_LOANWORD)("Thai+loanword word-boundary skip %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
  it.each(FP_SHORT_PV_HARASS)("short IPV/harassment stays on its card: %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
  it.each(FP_TI_IDIOMS)("ตี/ซ้อม idiom %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn("ต้องทำไงดี", [text]).crisis, text).toBe(false);
  });
});

const BARE_HELP = [
  "help",
  "HELP",
  "help me",
  "please help",
  "pls help me",
  "help!",
  "help?",
  "help 😭",
];

describe("bare help stays on the card (Thai-only exact list)", () => {
  it.each(BARE_HELP)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });

  it.each([
    "help me choose a condom",
    "please help me understand PrEP",
    "I need help finding a clinic",
    "Can you help me with emergency contraception",
  ])("longer help-in-normal-use does not fire: %s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
});

describe("short English crisis phrases the pin misses", () => {
  it.each(EN_SHORT_CRISIS)("$text", ({ text, cat }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.categories, text).toContain(cat);
  });
});

describe("short English that is no longer on the exact list stays on the card", () => {
  it.each(EN_SHORT_NOW_CARD)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
});

const FULLWIDTH_ACCENTED = [
  { text: "หนูอยาก ｄｉｅ ค่ะ", crisis: true, token: "die" },
  { text: "อยาก ｋｉｌｌ ตัวเอง", crisis: false, token: null },
  { text: "หนูรู้สึก ｓｕｉｃｉｄａｌ มาหลายวันแล้ว", crisis: true, token: "suicidal" },
  { text: "หนูอยาก ḍïë ค่ะ", crisis: true, token: "die" },
  { text: "อยาก ｄｉｅ HIV ค่ะ", crisis: true, token: "die" },
  { text: "I want to ｋｉｌｌ ｍｙｓｅｌｆ", crisis: true, token: "kill" },
  { text: "I want to kíll myself", crisis: true, token: "kill" },
];

/** First-person English disclosures the pin misses (and close variants). */
const EN_FIRST_PERSON_CRISIS: { text: string; cat: "self_harm" | "sexual_violence" | "violence_danger" }[] = [
  { text: "I want to hurt myself", cat: "self_harm" },
  { text: "I want to harm myself", cat: "self_harm" },
  { text: "I keep hurting myself", cat: "self_harm" },
  { text: "I don't want to be alive", cat: "self_harm" },
  { text: "I do not want to be alive", cat: "self_harm" },
  { text: "I wish I was dead", cat: "self_harm" },
  { text: "I wish I were dead", cat: "self_harm" },
  { text: "my stepdad molested me", cat: "sexual_violence" },
  { text: "he is molesting me", cat: "sexual_violence" },
  { text: "he forced me", cat: "sexual_violence" },
  { text: "My boyfriend is forcing me to have sex", cat: "sexual_violence" },
  { text: "she is forcing me", cat: "sexual_violence" },
  { text: "he abused me", cat: "sexual_violence" },
];

/** Health questions that used to fire on bare die/cut/abuse. */
const FP_HEALTH_DIE_CUT_ABUSE = [
  "condom got cut what to do",
  "ถุงยาง cut ได้ไหม",
  "เชื้อ HIV die นอกร่างกายไหม",
  "can HIV die in air",
  "PrEP cut dose",
  "Do sperm die in water?",
];

describe("fullwidth/accented English crisis words after NFKC + diacritic fold", () => {
  it.each(FULLWIDTH_ACCENTED)("$text", ({ text, crisis, token }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(crisis);
    if (crisis && token) {
      expect(hit.rules.join(" "), text).toMatch(new RegExp(`\\b${token}\\b`, "i"));
      expect(hit.categories, text).toContain("self_harm");
    }
  });
});

const SUICIDE_TH = ["ซุยไซด์", "ซูอิไซด์", "ซูไซด์", "หนูคิดซุยไซด์", "อยากซูอิไซด์ค่ะ"];

describe("TH-G suicide transliteration (pin misses)", () => {
  it.each(SUICIDE_TH)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.rules, text).toContain("TH-G suicide transliteration");
    expect(hit.categories, text).toContain("self_harm");
  });
});

describe("English crisis tokens inside mostly-Thai lines", () => {
  it.each(TH_EN_CRISIS_LOANWORD)("$text ($token)", ({ text, token, cat }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.categories, text).toContain(cat);
    expect(hit.rules.join(" "), text).toMatch(new RegExp(`\\b${token}\\b`, "i"));
  });
});

describe("fuzzy first-person English disclosures stay on the card (Thai-only exact list)", () => {
  it.each(EN_FIRST_PERSON_CRISIS)("$text", ({ text }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
  });
});

describe("health-question false positives (bare die/cut/abuse must not fire)", () => {
  it.each(FP_HEALTH_DIE_CUT_ABUSE)("%s", (text) => {
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
});

/** Codex round-2 cited false positives: pronoun-window / health-sense English words. */
const CODEX_PRECISION_FP = [
  "หนูอยากรู้ว่าเชื้อ HIV die นอกร่างกายไหม",
  "หนูจะ die ไหมถ้าติด HIV",
  "Am I going to die from HIV?",
  "can I cut my pill in half",
  "ตัวเองต้อง cut ถุงยางก่อนใช้ไหม",
  "I cut my nails before fingering",
  "I live 3 kms from the clinic where can I test HIV",
  "my parents forced me to get tested for HIV",
  "My doctor forced me to take an HIV test",
  "I watched a movie about suicide",
  "does HIV die outside the body",
  "die outside the body",
  "going to die from HIV",
  "จะ die ไหม",
  "die in water",
  "die in air",
  "drug abuse",
  "substance abuse",
  "a movie about suicide",
];

describe("precision false positives (adjacent phrases only; Codex round 2)", () => {
  it.each(CODEX_PRECISION_FP)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
});

const PRECISION_TP: { text: string; cat: "self_harm" | "sexual_violence" | "violence_danger" }[] = [
  { text: "kms", cat: "self_harm" },
  { text: "kms.", cat: "self_harm" },
  { text: "gonna kms", cat: "self_harm" },
  { text: "i want to kms", cat: "self_harm" },
  { text: "i will kms", cat: "self_harm" },
  { text: "I am going to kms tonight", cat: "self_harm" },
  { text: "อยาก kms", cat: "self_harm" },
  { text: "คิดจะ kms", cat: "self_harm" },
  { text: "self-harm", cat: "self_harm" },
  { text: "self harm", cat: "self_harm" },
  { text: "หนู cut แขน", cat: "self_harm" },
  { text: "หนู cut ข้อมือ", cat: "self_harm" },
];

const PRECISION_NOW_CARD = [
  "ready to die",
  "I want to be dead",
  "cut my wrist",
  "cut my wrists",
  "cut my arm",
  "sexually abused me",
];

describe("adjacent first-person crisis phrases still hit", () => {
  it.each(PRECISION_TP)("$text", ({ text, cat }) => {
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.categories, text).toContain(cat);
  });

  it("split อยาก + die still fires on the current turn via the window", () => {
    expect(detectChatCrisis("die ค่ะ").crisis).toBe(false);
    expect(detectChatCrisisForTurn("die ค่ะ", ["หนูอยาก"]).crisis).toBe(true);
  });
});

describe("fuzzy English adjacent phrases now stay on the card", () => {
  it.each(PRECISION_NOW_CARD)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
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

/** Jane is Thai-only. Short exact English phrases on folded lowercase text. */
const EN_EXACT_PHRASE_TP: { text: string; cat: "self_harm" | "sexual_violence" }[] = [
  { text: "kill myself", cat: "self_harm" },
  { text: "killing myself", cat: "self_harm" },
  { text: "kms", cat: "self_harm" },
  { text: "kms.", cat: "self_harm" },
  { text: "gonna kms", cat: "self_harm" },
  { text: "commit suicide", cat: "self_harm" },
  { text: "I want to die", cat: "self_harm" },
  { text: "wanna die", cat: "self_harm" },
  { text: "I wanna die", cat: "self_harm" },
  { text: "end my life", cat: "self_harm" },
  { text: "I was raped", cat: "sexual_violence" },
  { text: "he raped me", cat: "sexual_violence" },
  { text: "self harm", cat: "self_harm" },
  { text: "self-harm", cat: "self_harm" },
  { text: "cut myself", cat: "self_harm" },
  { text: "cutting myself", cat: "self_harm" },
  { text: "I'm suicidal", cat: "self_harm" },
  { text: "I am suicidal", cat: "self_harm" },
  { text: "i'm suicidal", cat: "self_harm" },
  { text: "I am going to kms tonight", cat: "self_harm" },
];

/** Codex + owner: these must stay on the card (extra check must not fire). */
const EN_EXACT_PHRASE_FP = [
  "I don't wanna die, is HIV curable",
  "i dont wanna die",
  "I don't wanna die",
  "can birth control cause suicidal thoughts",
  "can PrEP cause suicidal thoughts?",
  "does the morning after pill cause suicidal thoughts",
  "ยาคุมทำให้มี suicidal thoughts ได้ไหม",
  "I cut my skin shaving down there, can I get HIV",
  "I cut my legs shaving can I still have sex",
  "the condom got cut",
  "condom was cut",
  "หนูไม่อยาก die เพราะ HIV ต้องทำยังไง",
  "ผมไม่อยาก die ครับ ตรวจ HIV ที่ไหน",
  "ไม่อยาก kms",
];

describe("exact English crisis phrases (Thai-only short list)", () => {
  it.each(EN_EXACT_PHRASE_TP)("$text", ({ text, cat }) => {
    const extra = detectChatCrisis(text);
    const pinned = detectCrisis(text).crisis;
    expect(pinned || extra.crisis, text).toBe(true);
    if (extra.crisis) expect(extra.categories, text).toContain(cat);
    else expect(detectCrisis(text).categories, text).toContain(cat);
  });
});

describe("narrow don't-wanna-die guard and Codex card lines", () => {
  it.each(EN_EXACT_PHRASE_FP)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
});

describe("round-4 precision guards stay on the card (pin misses)", () => {
  it("has the converted safe-side block plus at least 30 variants", () => {
    expect(ROUND4_PRECISION_CARD_LINES.length).toBeGreaterThanOrEqual(41);
    expect(ROUND4_PRECISION_CARD_LINES).toContain("หนูไม่ อยาก die เพราะ HIV ต้องทำยังไง");
    expect(ROUND4_PRECISION_CARD_LINES).toContain("I don't really wanna die, is HIV curable");
    expect(ROUND4_PRECISION_CARD_LINES).toContain("ยาคุมทำให้รู้สึก suicidal ได้ไหม");
    expect(ROUND4_PRECISION_CARD_LINES).toContain("I cut myself shaving down there, can I get HIV");
  });

  it.each(ROUND4_PRECISION_CARD_LINES)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisis(text).crisis, text).toBe(false);
    expect(detectChatCrisisForTurn(text, []).crisis, text).toBe(false);
  });
});

/** Pin already overrides these; extra check must not be required. */
const PINNED_MUST_TRIGGER = [
  "ไม่อยากอยู่แล้ว",
  "ไม่อยากมีชีวิตอยู่",
  "หนูไม่อยาก die แต่ไม่อยากอยู่แล้ว",
];

/**
 * First-person disclosures the Thai-only exact list previously sent to the card.
 * Extra check must fire; pin misses.
 */
const ROUND4_MUST_TRIGGER_NEW = [
  "I don't want to live",
  "i dont want to live anymore",
  "หนู suicidal",
  "ผม suicidal",
  "I have suicidal thoughts",
  "i'm having suicidal thoughts",
  "I dont want to live",
  "ฉัน suicidal",
  "เรา suicidal",
  "I have suicidal thoughts every night",
  "I'm having suicidal thoughts",
  "i am having suicidal thoughts",
  "หนู suicidal ค่ะ",
  "หนูไม่อยาก die แต่หนู suicidal",
  "หนู suicidal ตอนนี้",
  "ผม suicidal ครับ",
  "I DON'T WANT TO LIVE",
  "I don't want to live anymore.",
];

/** Negation/side-effect/accidental-cut must not clear a separate real disclosure. */
const ROUND4_MUST_TRIGGER_TRICKY = [
  "หนูไม่ อยาก die แต่หนูอยาก kms",
  "ยาคุมทำให้หนูอยาก die แล้ว",
  "I don't really wanna die but I wanna die tonight",
  "หนูไม่ได้รู้สึก suicidal แต่หนูอยาก die",
  "I cut myself. I was only shaving later",
  "I cut myself on purpose",
  "I've been cutting myself",
  "I cut myself because I hate myself",
  "I don't really wanna die but I have suicidal thoughts",
  "i'm suicidal",
  "หนูไม่ได้รู้สึก suicidal นะ แต่หนู suicidal",
  "I don't wanna die. I cut myself on purpose",
];

describe("pinned crisis.ts still overrides the listed Thai live-wish lines", () => {
  it.each(PINNED_MUST_TRIGGER)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(true);
    expect(detectCrisis(text).categories, text).toContain("self_harm");
  });
});

describe("round-4 first-person disclosures the extra check must catch (pin misses)", () => {
  it("has at least 15 new must-trigger variants", () => {
    expect(ROUND4_MUST_TRIGGER_NEW.length).toBeGreaterThanOrEqual(15);
  });

  it.each(ROUND4_MUST_TRIGGER_NEW)("%s", (text) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
    const hit = detectChatCrisis(text);
    expect(hit.crisis, text).toBe(true);
    expect(hit.categories, text).toContain("self_harm");
  });
});

describe("precision guards never clear a separate real crisis phrase", () => {
  it.each(ROUND4_MUST_TRIGGER_TRICKY)("%s", (text) => {
    const pinned = detectCrisis(text).crisis;
    const extra = detectChatCrisis(text);
    expect(pinned || extra.crisis, text).toBe(true);
    if (extra.crisis) expect(extra.categories, text).toContain("self_harm");
  });
});
