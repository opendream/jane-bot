import { describe, it, expect } from "vitest";
import fixture from "../fixtures/bank/valid-bank.json";
import {
  validateBank, checkShape, phonesIn, hoursIn, urlsIn, shippable, ageAllowed, cardsFromFiles, BANK_TOPICS,
  type BankCard,
} from "../../src/core/bank";
import { bankContext, BANK } from "../../src/core/bankData";
import { THAI_COPY_STATUS } from "../../src/config";

// All card text here is SYNTHETIC test data written for these tests.
const base = (): BankCard[] => JSON.parse(JSON.stringify(fixture.cards));
const ctx = bankContext(undefined, "draft", "2026-10-22");
const errors = (cards: BankCard[], c = ctx) => validateBank(cards, c).filter((i) => i.level === "error");
const rules = (cards: BankCard[], c = ctx) => errors(cards, c).map((e) => e.rule);
const withCard = (patch: (c: BankCard) => void, i = 0) => { const cs = base(); patch(cs[i]); return cs; };

describe("bank schema: the synthetic fixture is valid", () => {
  it("has no errors", () => expect(errors(base())).toEqual([]));
  it("topics are the 8 intents plus general, ending, quiz", () => {
    expect(BANK_TOPICS).toHaveLength(11);
    expect(BANK_TOPICS).toEqual(expect.arrayContaining(["pregnancy", "other", "general", "ending", "quiz"]));
  });
});

describe("bank schema: shape", () => {
  it("rejects a non-object", () => expect(checkShape(null)[0].rule).toBe("shape"));
  it.each([
    ["id", (c: any) => { c.id = "Bad Id"; }],
    ["id", (c: any) => { c.id = "ec"; }],
    ["topic", (c: any) => { c.topic = "jokes"; }],
    ["title_th", (c: any) => { c.title_th = "ก".repeat(41); }],
    ["title_th", (c: any) => { c.title_th = " "; }],
    ["answer_th", (c: any) => { c.answer_th = "ก".repeat(401); }],
    ["answer_th", (c: any) => { delete c.answer_th; }],
    ["variants_th", (c: any) => { c.variants_th = "not-an-array"; }],
    ["key_facts", (c: any) => { c.key_facts = [1]; }],
    ["triggers", (c: any) => { c.triggers = null; }],
    ["next", (c: any) => { c.next = [{ label_th: "x" }]; }],
    ["source", (c: any) => { c.source = [{ url: "https://rsathai.org" }]; }],
    ["review", (c: any) => { c.review = { status: "ok" }; }],
    ["last_reviewed", (c: any) => { c.last_reviewed = "22/10/2026"; }],
    ["flags", (c: any) => { c.flags = ["spicy"]; }],
    ["referral", (c: any) => { c.referral = { offer: "maybe", intents: [] }; }],
    ["referral", (c: any) => { c.referral = { offer: "soft", intents: ["jokes"] }; }],
    ["links", (c: any) => { c.links = [{ url: "https://rsathai.org" }]; }],
    ["age_min", (c: any) => { c.age_min = 16; }],
    ["reword", (c: any) => { c.reword = "yes"; }],
    ["licence", (c: any) => { c.licence = ""; }],
    ["placeholder", (c: any) => { c.placeholder = "yes"; }],
  ])("rule %s", (rule, patch) => expect(rules(withCard(patch as any))).toContain(rule));
  it("ids like ec.000 and ec.a001 are valid", () => {
    expect(checkShape({ ...base()[0], id: "ec.000" })).toEqual([]);
    expect(checkShape({ ...base()[0], id: "ec.a001" })).toEqual([]);
    expect(checkShape({ ...base()[0], id: "pregnancy.late.012" })).toEqual([]);
  });
});

describe("bank rules: cross-card", () => {
  it("unique ids", () => { const cs = base(); cs[1].id = cs[0].id; expect(rules(cs)).toContain("unique_id"); });
  it("every next.card_id exists", () => expect(rules(withCard((c) => { c.next = [{ label_th: "x", card_id: "fixture.nope.000" }]; }))).toContain("next_exists"));
  it("a loop with no exit fails; a loop with a referral or a way out passes", () => {
    const loop = withCard((c) => { c.referral = { offer: "none", intents: [] }; }, 1);
    expect(rules(loop)).toContain("cycle_exit");
    expect(rules(base())).not.toContain("cycle_exit"); // card 1 offers a referral
    const self = withCard((c) => { c.next = [{ label_th: "อีก", card_id: c.id }]; });
    self[0].next.push({ label_th: "ไปต่อ", card_id: "fixture.info.001" });
    expect(rules(self)).not.toContain("cycle_exit"); // leaves the loop via card 1
  });
});

describe("bank rules: content", () => {
  it("key facts must be in answer_th and in every variant", () => {
    expect(rules(withCard((c) => { c.key_facts = ["ไม่มีในข้อความ"]; }))).toContain("key_facts");
    expect(rules(withCard((c) => { c.variants_th = ["ทดสอบแบบอื่น"]; }))).toContain("key_facts");
    expect(rules(withCard((c) => { c.variants_th = ["นี่คือข้อความทดสอบอีกแบบ"]; }))).not.toContain("key_facts");
  });
  it("every phone number must exist in services.json and the card must be flagged hotline", () => {
    const leaked = errors(withCard((c) => { c.answer_th = "ข้อความทดสอบ โทร 1999"; }, 1));
    expect(leaked.map((e) => e.rule)).toContain("phone_in_services");
    expect(leaked.find((e) => e.rule === "phone_in_services")?.msg).not.toContain("1999");
    expect(rules(withCard((c) => { c.answer_th = "ข้อความทดสอบ โทร 1323"; c.key_facts = []; }))).toContain("hotline_flag");
    expect(rules(withCard((c) => { c.answer_th = "ข้อความทดสอบ โทร ๑๖๖๓"; c.key_facts = []; }, 1))).toEqual([]); // Thai digits
  });
  it("hours must match a cited source for a contact on the card", () => {
    const h = (t: string) => withCard((c) => { c.answer_th = t; c.key_facts = []; c.flags = [...c.flags, "hours"]; }, 1);
    expect(rules(h("ข้อความทดสอบ โทร 1663 เวลา 09:00–21:00 น."))).toEqual([]);            // operator / RSATHAI / NHSO
    expect(rules(h("ข้อความทดสอบ โทร 1663 เวลา 10.00-20.00 น."))).toContain("hours_match_source");
    expect(rules(h("ข้อความทดสอบ โทร 1663 เวลา 08:00–22:00 น."))).toContain("hours_match_source");
    expect(rules(h("ข้อความทดสอบ โทร 1323 ได้ 24 ชั่วโมง"))).toEqual([]);
    expect(rules(h("ข้อความทดสอบ โทร 1663 ได้ 24 ชั่วโมง"))).toContain("hours_match_source");
    expect(rules(withCard((c) => { c.answer_th = "ข้อความทดสอบ โทร 1663 เวลา 09:00–21:00 น."; }, 1))).toContain("hours_flag");
  });
  it("hotline and legal cards must be verbatim-only", () => {
    expect(rules(withCard((c) => { c.reword = true; }, 1))).toContain("reword_false");
    expect(rules(withCard((c) => { c.flags = ["legal"]; }))).toContain("reword_false");
  });
  it("approved medical/legal cards need a source and a reviewer; approved cards need pii_checked", () => {
    expect(rules(withCard((c) => { c.source = []; }, 1))).toContain("medical_source");
    expect(rules(withCard((c) => { c.review.reviewer = null; }, 1))).toContain("medical_reviewer");
    expect(rules(withCard((c) => { c.flags = ["hotline", "medical"]; }, 1))).toContain("pii_checked");
    expect(rules(withCard((c) => { c.source = []; c.review.status = "draft"; }, 1))).not.toContain("medical_source");
  });
  it("links: allow-listed hosts only, no shorteners, no images, no URLs in the text", () => {
    expect(rules(withCard((c) => { c.links = [{ url: "https://tinyurl.com/x", label_th: "x" }]; }, 1))).toContain("link_shortener");
    expect(rules(withCard((c) => { c.links = [{ url: "https://rsathai.org/a.jpg", label_th: "x" }]; }, 1))).toContain("link_image");
    expect(rules(withCard((c) => { c.links = [{ url: "https://example.com/", label_th: "x" }]; }, 1))).toContain("link_allowlist");
    expect(rules(withCard((c) => { c.answer_th = "ข้อความทดสอบ ดูที่ example.com/page"; c.key_facts = []; }))).toContain("no_url_in_text");
  });
  it("PII: text must be unchanged by stripPII (service handles from services.json are allowed)", () => {
    expect(rules(withCard((c) => { c.answer_th = "ข้อความทดสอบ ชื่อสมมติ ติดต่อ 081 234 5678"; c.key_facts = []; }))).toContain("pii");
    expect(rules(withCard((c) => { c.answer_th = "ข้อความทดสอบ อีเมล test@example.com"; c.key_facts = []; }))).toContain("pii");
    expect(rules(withCard((c) => { c.answer_th = "ข้อความทดสอบ ทักไลน์ @teen_club ได้"; c.key_facts = []; }))).not.toContain("pii");
  });
  it("placeholder cards must say PLACEHOLDER and can never be approved", () => {
    expect(rules(withCard((c) => { c.placeholder = true; }))).toContain("placeholder_mark");
    expect(rules(withCard((c) => { c.placeholder = true; c.answer_th = "PLACEHOLDER ข้อความทดสอบ"; }))).toEqual([]);
    expect(rules(withCard((c) => { c.placeholder = true; c.answer_th = "PLACEHOLDER ข้อความทดสอบ โทร 1663 ได้"; }, 1))).toContain("placeholder_approved");
  });
  it("ship gate: with copy 'reviewed' only approved, non-placeholder cards pass", () => {
    const reviewed = bankContext(undefined, "reviewed", "2026-10-22");
    expect(rules(base(), reviewed)).toEqual(["ship_gate"]); // card 0 is draft
    expect(shippable(base()[0], "reviewed")).toBe(false);
    expect(shippable(base()[1], "reviewed")).toBe(true);
    expect(shippable(base()[0], "draft")).toBe(true);
    expect(shippable({ ...base()[0], review: { status: "rejected", reviewer: null, reviewed_on: null } }, "draft")).toBe(false);
  });
  it("warns (not errors) when a card is older than 12 months", () => {
    const cs = withCard((c) => { c.last_reviewed = "2025-01-10"; }, 1);
    const all = validateBank(cs, ctx);
    expect(all.find((i) => i.rule === "stale")?.level).toBe("warning");
    expect(errors(cs)).toEqual([]);
  });
  it("age gate (D5 default): 18+ cards hidden for 15–17 and 'prefer not to say'", () => {
    const c = { ...base()[0], age_min: 18 as const };
    expect(ageAllowed(c, "15-17")).toBe(false);
    expect(ageAllowed(c, "unspecified")).toBe(false);
    expect(ageAllowed(c, "18-24")).toBe(true);
    expect(ageAllowed(base()[0], "15-17")).toBe(true);
  });
});

describe("bank text helpers", () => {
  it("phonesIn finds hotlines and Thai digits, not times or years", () => {
    expect(phonesIn("โทร 1663 หรือ ๑๓๒๓ หรือ 191")).toEqual(["1663", "1323", "191"]);
    expect(phonesIn("เวลา 10:00 ปี 2026 72 ชั่วโมง")).toEqual([]);
    expect(phonesIn("โทร 02-123-4567")).toEqual(["021234567"]);
    expect(phonesIn("โทร 08-1234-5678 หรือ 0812-345-678 หรือ 0-2123-4567")).toEqual(["0812345678", "021234567"]);
    expect(phonesIn("โทร ๐๘๑-๒๓๔-๕๖๗๘")).toEqual(["0812345678"]);
  });
  it("hoursIn normalises ranges", () => {
    expect(hoursIn("9.00-21.00 น.")).toEqual(["09:00–21:00"]);
    expect(hoursIn("17:00 ถึง 23:00")).toEqual(["17:00–23:00"]);
    expect(hoursIn("เปิด 24 ชั่วโมง")).toEqual(["24h"]);
  });
  it("urlsIn finds bare and full URLs", () => {
    expect(urlsIn("ดู https://rsathai.org/x และ tinyurl.com/abc")).toHaveLength(2);
    expect(urlsIn("ไม่มีลิงก์ 1663")).toEqual([]);
  });
  it("cardsFromFiles skips quiz.json and rejects a file without cards", () => {
    expect(cardsFromFiles({ "a.json": { default: fixture }, "quiz.json": { questions: [] } })).toHaveLength(2);
    expect(() => cardsFromFiles({ "b.json": { nope: 1 } })).toThrow();
  });
});

describe("bundled bank (src/data/bank)", () => {
  it("validates with no errors under the current THAI_COPY_STATUS", () => {
    const c = bankContext(undefined, THAI_COPY_STATUS, new Date().toISOString().slice(0, 10));
    expect(validateBank(BANK, c).filter((i) => i.level === "error")).toEqual([]);
  });
});
