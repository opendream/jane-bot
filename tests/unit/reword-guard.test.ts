import { describe, it, expect } from "vitest";
import { acceptReword, rewordFailures, LENGTH, type RewordCheck } from "../../src/llm/rewordGuard";
import { bankContext, BANK } from "../../src/core/bankData";
import { REFUSAL_CARDS } from "../../src/core/guard";
import type { BankCard } from "../../src/core/bank";

// SYNTHETIC cards and texts written for these tests (not medical advice, not ThaiHealth content).
const ctx = bankContext(undefined, "draft", "2026-10-22");
const mk = (id: string, answer_th: string, key_facts: string[], variants_th: string[] = []): BankCard => ({
  id, topic: "other", title_th: "ทดสอบ", answer_th, variants_th, key_facts, triggers: [], next: [], source_intents: [], source: [],
  review: { status: "draft", reviewer: null, reviewed_on: null }, last_reviewed: null, flags: [], referral: { offer: "none", intents: [] },
  links: [], age_min: 15, reword: true, licence: "test-only",
});
const SYN: BankCard[] = [
  mk("t.numbers.001", "ข้อความทดสอบ ยิ่งใช้เร็วยิ่งดี ภายใน 72 ชั่วโมง และถามเภสัชกรที่ร้านขายยาได้เลย", ["72 ชั่วโมง", "ร้านขายยา"],
    ["ข้อความทดสอบ ใช้เร็วที่สุดจะดีกว่า ภายใน 72 ชั่วโมง ถามเภสัชกรที่ร้านขายยาได้", "ข้อความทดสอบ ควรใช้ภายใน 72 ชั่วโมง ยิ่งเร็วยิ่งดี ปรึกษาเภสัชกรที่ร้านขายยาได้เลย"]),
  mk("t.phone.002", "ข้อความทดสอบ ถ้าอยากคุยกับเจ้าหน้าที่ โทรสายด่วน 1663 ได้ เป็นความลับ", ["1663", "เป็นความลับ"],
    ["ข้อความทดสอบ อยากคุยกับเจ้าหน้าที่ก็โทรสายด่วน 1663 ได้นะ เป็นความลับ"]),
  mk("t.hours.003", "ข้อความทดสอบ ทักไลน์ @teen_club คุยกับเจ้าหน้าที่ได้ช่วง 17:00–23:00 น. ทุกวัน", ["@teen_club", "17:00–23:00"],
    ["ข้อความทดสอบ คุยกับเจ้าหน้าที่ทางไลน์ @teen_club ได้ทุกวันช่วง 17:00–23:00 น."]),
  mk("t.plain.004", "ข้อความทดสอบ ความรู้สึกแบบนี้เกิดขึ้นได้ คุณไม่ได้อยู่คนเดียว ลองคุยกับคนที่ไว้ใจดูนะ", ["ไม่ได้อยู่คนเดียว"],
    ["ข้อความทดสอบ ความรู้สึกแบบนี้เกิดได้กับทุกคน คุณไม่ได้อยู่คนเดียว ลองคุยกับคนที่ไว้ใจนะ"]),
];
const REWORDABLE = [...SYN, ...BANK.filter((c) => c.reword)];

type Mut = [name: string, expect: RewordCheck, f: (c: BankCard) => string | null];
const firstDigit = (s: string) => s.search(/\d/);
const MUTATIONS: Mut[] = [
  ["change a digit", "numbers", (c) => { const i = firstDigit(c.answer_th); return i < 0 ? null : c.answer_th.slice(0, i) + (c.answer_th[i] === "9" ? "8" : String(+c.answer_th[i] + 1)) + c.answer_th.slice(i + 1); }],
  ["add a number", "numbers", (c) => `${c.answer_th} ภายใน 3 วัน`],
  ["drop a number", "numbers", (c) => (firstDigit(c.answer_th) < 0 ? null : c.answer_th.replace(/\d+/, ""))],
  ["Thai-digit swap still counts as the same number", "numbers", (c) => (firstDigit(c.answer_th) < 0 ? null : c.answer_th.replace(/\d/, (d) => String.fromCharCode(0x0e50 + ((+d + 1) % 10))))],
  ["change the phone", "phones", (c) => (c.answer_th.includes("1663") ? c.answer_th.replace("1663", "1323") : null)],
  ["add a phone", "phones", (c) => `${c.answer_th} หรือโทร 1300`],
  ["add an unknown hotline", "phones", (c) => `${c.answer_th} โทร 1111`],
  ["change the hours", "hours", (c) => (c.answer_th.includes("17:00–23:00") ? c.answer_th.replace("17:00–23:00", "17:00–22:00") : null)],
  ["add hours", "hours", (c) => `${c.answer_th} เปิด 24 ชั่วโมง`],
  ["add a URL", "links", (c) => `${c.answer_th} ดูที่ example.com/x`],
  ["add a short link", "links", (c) => `${c.answer_th} https://bit.ly/abc`],
  ["add a LINE id", "links", (c) => `${c.answer_th} ไลน์ไอดี abc123`],
  ["change a handle", "links", (c) => (c.answer_th.includes("@teen_club") ? c.answer_th.replace("@teen_club", "@teen_club2") : null)],
  ["add a drug", "medical_claims", (c) => `${c.answer_th} ใช้ยาปฏิชีวนะได้`],
  ["add a dose", "medical_claims", (c) => `${c.answer_th} กินหนึ่งเม็ด`],
  ["add a cure claim", "medical_claims", (c) => `${c.answer_th} รักษาหายขาด`],
  ["add 'no need for a doctor'", "medical_claims", (c) => `${c.answer_th} ไม่ต้องไปหาหมอ`],
  ["add a diagnosis", "medical_claims", (c) => `${c.answer_th} คุณติดเชื้อแล้ว`],
  ["drop a key fact", "facts", (c) => (c.key_facts.length ? c.answer_th.split(c.key_facts[0]).join("") : null)],
  ["negate next to a key fact", "negation", (c) => (c.key_facts.length && !/^\d/.test(c.key_facts[0]) ? c.answer_th.replace(c.key_facts[0], `อย่า${c.key_facts[0]}`) : null)],
  ["double the length", "length", (c) => `${c.answer_th} ${c.answer_th}`],
  ["cut to a stub", "length", (c) => c.answer_th.slice(0, Math.floor(c.answer_th.length * 0.4))],
  ["over the hard cap", "length", (c) => `${c.answer_th} ${"ก".repeat(LENGTH.hardCap)}`],
  ["two paragraphs", "paragraph", (c) => c.answer_th.replace(" ", "\n")],
  ["explicit term", "banned", (c) => `${c.answer_th} เงี่ยน`],
  ["roleplay framing", "banned", (c) => `${c.answer_th} *กอด*`],
  ["judging word", "banned", (c) => `${c.answer_th} น่าอาย`],
  ["dosing instruction", "banned", (c) => `${c.answer_th} กินครั้งละสองเม็ด`],
  ["abortion method", "banned", (c) => `${c.answer_th} ใช้ยาทำแท้ง`],
  ["crisis words", "crisis", (c) => `${c.answer_th} อยากตาย`],
  ["PII: phone", "pii", (c) => `${c.answer_th} 081-234-5678`],
  ["PII: name", "pii", (c) => `${c.answer_th} ชื่อสมศรี`],
  ["PII: email", "pii", (c) => `${c.answer_th} a@b.co`],
  ["English only", "english_only", () => "This is general information. Please talk to a pharmacist or call a hotline soon, it is confidential."],
  ["<think> remnant", "think", (c) => `<think>ok</think>${c.answer_th}`],
  ["empty", "empty", () => "   "],
  ["PLACEHOLDER mark dropped", "placeholder", (c) => (c.answer_th.includes("PLACEHOLDER") ? c.answer_th.replace("PLACEHOLDER", "") : null)],
];

describe("reword validator: identity and reviewed variants are accepted (100%)", () => {
  it.each(REWORDABLE.map((c) => [c.id, c] as const))("%s: canonical text passes every check", (_id, c) => {
    expect(rewordFailures(c, c.answer_th, ctx)).toEqual([]);
    expect(acceptReword(c, c.answer_th, ctx)).toMatchObject({ text: c.answer_th, reworded: false }); // identical → not labelled reworded
  });
  const variants = SYN.flatMap((c) => (c.variants_th ?? []).map((v, i) => [`${c.id} v${i}`, c, v] as const));
  it.each(variants)("%s is accepted as a reword", (_n, c, v) => {
    expect(rewordFailures(c, v, ctx)).toEqual([]);
    expect(acceptReword(c, v, ctx)).toEqual({ text: v, reworded: true, failures: [] });
  });
});

describe("reword validator: generated mutations are rejected (100%) and fall back to the exact text", () => {
  const cases: [string, string, RewordCheck, BankCard, string][] = [];
  for (const c of REWORDABLE) for (const [name, want, f] of MUTATIONS) { const out = f(c); if (out !== null) cases.push([c.id, name, want, c, out]); }
  it("covers every mutation kind on at least one card", () => {
    const kinds = new Set(cases.map((x) => x[1]));
    expect(MUTATIONS.filter(([n]) => !kinds.has(n)).map(([n]) => n)).toEqual([]);
    expect(cases.length).toBeGreaterThan(150);
  });
  it.each(cases)("%s / %s → %s", (_id, _name, want, c, out) => {
    const fails = rewordFailures(c, out, ctx);
    expect(fails).toContain(want);
    expect(acceptReword(c, out, ctx)).toMatchObject({ text: c.answer_th, reworded: false });
  });
  it("rejection rate is 100% across all mutations", () => {
    const accepted = cases.filter(([, , , c, out]) => acceptReword(c, out, ctx).reworded);
    expect(accepted.map(([id, n]) => `${id}/${n}`)).toEqual([]);
  });
});

describe("reword validator: details", () => {
  const c = SYN[0];
  it("null or undefined output is empty and falls back", () => {
    expect(rewordFailures(c, null, ctx)).toEqual(["empty"]);
    expect(acceptReword(c, undefined, ctx)).toMatchObject({ text: c.answer_th, reworded: false });
  });
  it("Thai and Arabic digits are the same number", () => expect(rewordFailures(c, c.answer_th.replace("72", "๗๒"), ctx)).not.toContain("numbers"));
  it("a new negation far from key facts is allowed; next to a key fact it is not", () => {
    expect(rewordFailures(SYN[3], "ข้อความทดสอบ ไม่ต้องรีบนะ ความรู้สึกแบบนี้เกิดขึ้นได้ คุณไม่ได้อยู่คนเดียว ลองคุยกับคนที่ไว้ใจ", ctx)).toEqual([]);
    expect(rewordFailures(c, c.answer_th.replace("ร้านขายยา", "ไม่ใช่ร้านขายยา"), ctx)).toContain("negation");
  });
  it("a medical term already in the canonical text is not 'new'", () => {
    const d = mk("t.drug.005", "ข้อความทดสอบ ยาต้านไวรัสต้องปรึกษาแพทย์ก่อนเสมอ อย่าซื้อเอง", ["ปรึกษาแพทย์"]);
    expect(rewordFailures(d, "ข้อความทดสอบ เรื่องยาต้านไวรัส ควรปรึกษาแพทย์ก่อนเสมอ ไม่ควรซื้อเอง", ctx)).toEqual([]);
  });
  it("crisis level may stay the same but never rise", () => {
    const d = mk("t.crisis.006", "ข้อความทดสอบ ถ้ารู้สึกอยากตาย โทร 1323 ได้ตลอดเวลา", ["1323"]);
    expect(rewordFailures(d, "ข้อความทดสอบ ถ้ารู้สึกอยากตาย โทรหา 1323 ได้ตลอดเวลานะ", ctx)).toEqual([]);
  });
  it("cards marked reword: false are always verbatim", () => {
    const fixed = { ...SYN[3], reword: false };
    expect(acceptReword(fixed, SYN[3].variants_th![0], ctx)).toEqual({ text: fixed.answer_th, reworded: false, failures: [] });
    for (const r of Object.values(REFUSAL_CARDS)) expect(acceptReword(r, "อะไรก็ได้ที่ต่างไป ข้อความทดสอบ", ctx).text).toBe(r.answer_th);
  });
  it("hotline, legal and dose cards in the bank are verbatim-only", () => {
    for (const b of BANK) if (b.flags.includes("hotline") || b.flags.includes("legal")) expect(b.reword, b.id).toBe(false);
  });
});
