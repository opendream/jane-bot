import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
// @ts-ignore plain JS module shared with the Node scripts
import { findPII, scrubPII, nationalIdChecksumOk, toArabic } from "../../scripts/bank/pii-patterns.mjs";
// @ts-ignore
import { scanDir, scanValue, scanFile, formatFinding, jsonParseError } from "../../scripts/bank/guard.mjs";
import { validateBank, type BankCard } from "../../src/core/bank";
import { bankContext } from "../../src/core/bankData";
import { stripPII } from "../../src/core/summary";
import fixture from "../fixtures/bank/valid-bank.json";

const formatIssue = (i: { level: string; card: string; rule: string; msg: string }) =>
  `${i.level.padEnd(7)} ${i.card} ${i.rule}: ${i.msg}`;

const ROOT = path.resolve(__dirname, "../..");
const BANK_DIR = path.resolve(__dirname, "../../src/data/bank");
const FIXTURE_BANK = path.resolve(__dirname, "../fixtures/bank/pii-gate");

/** SYNTHETIC values only. Never log these in assertions that print the value on failure of the leak checks — compare via includes. */
const SYN = {
  mobile: "0891112222",
  mobileDash: "08-1234-5678",
  mobileSplit: "0812-345-678",
  mobileDot: "08.1234.5678",
  mobileSpace: "08 1234 5678",
  landlineDash: "0-2123-4567",
  landlineDot: "02.123.4567",
  thaiMobile: "๐๘๑๒๓๔๕๖๗๘",
  thaiMobileDash: "๐๘๑-๒๓๔-๕๖๗๘",
  thaiId: "๑๒๓๔๕๖๗๘๙๐๑๒๑",
  thaiIdDash: "๑-๒๓๔๕-๖๗๘๙๐-๑๒-๑",
  id: "1234567890121",
  email: "someone99@example.com",
};

function blobOf(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

function expectNoSynthetic(haystack: unknown, extra: string[] = []) {
  const s = blobOf(haystack);
  for (const v of [SYN.mobile, SYN.mobileDash, SYN.mobileSplit, SYN.mobileDot, SYN.mobileSpace, SYN.landlineDash, SYN.landlineDot, SYN.thaiMobile, SYN.thaiMobileDash, SYN.thaiId, SYN.thaiIdDash, SYN.id, SYN.email, ...extra]) {
    expect(s).not.toContain(v);
  }
}

describe("committed bank files contain no PII and no Dialogflow export data", () => {
  it("fails loudly when the bank dir is missing or empty", () => {
    const missing = path.join(os.tmpdir(), `jane-bank-missing-${Date.now()}`);
    expect(() => scanDir(missing)).toThrow(/missing|empty/i);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "jane-bank-empty-"));
    expect(() => scanDir(empty)).toThrow(/missing|empty/i);
  });

  it("src/data/bank exists, has JSON files, and the scan is clean", () => {
    expect(fs.existsSync(BANK_DIR), "src/data/bank is missing — PII gate cannot run").toBe(true);
    const files = fs.readdirSync(BANK_DIR);
    expect(files.filter((f) => f.endsWith(".json")).length, "src/data/bank has no JSON files — PII gate cannot run").toBeGreaterThan(0);
    expect(files.filter((f) => !f.endsWith(".json"))).toEqual([]);
    const found = scanDir(BANK_DIR);
    expect(found.map((f: any) => formatFinding(f))).toEqual([]);
  });

  it("committed synthetic fixture bank directory scans clean", () => {
    expect(fs.existsSync(FIXTURE_BANK)).toBe(true);
    const files = fs.readdirSync(FIXTURE_BANK).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    const found = scanDir(FIXTURE_BANK);
    expect(found.map((f: any) => formatFinding(f))).toEqual([]);
  });
});

// The detector must actually catch each category, or a clean scan means nothing. All SYNTHETIC.
describe("PII detector self-test (synthetic strings only)", () => {
  const cases: [string, string][] = [
    ["thai_name", "หนูชื่อสมศรีค่ะ"],
    ["thai_name", "ติดต่อนางสาว ทดสอบ"],
    ["english_name", "my name is Zorbalina"],
    ["english_name", "ask Qwertina about it"],
    ["phone", "โทร 081-234-5678 นะ"],
    ["phone", "เบอร์ +66 81 234 5678"],
    ["phone", "บ้าน 02 123 4567"],
    ["phone", `โทร ${SYN.mobileDash}`],
    ["phone", `โทร ${SYN.mobileSplit}`],
    ["phone", `โทร ${SYN.landlineDash}`],
    ["phone", `โทร ${SYN.mobileDot}`],
    ["phone", `โทร ${SYN.mobileSpace}`],
    ["phone", `โทร ${SYN.landlineDot}`],
    ["phone", `โทร ${SYN.thaiMobile}`],
    ["phone", `โทร ${SYN.thaiMobileDash}`],
    ["email", "ส่งมาที่ someone@example.com"],
    ["line_id", "ไลน์ไอดี: test_user99"],
    ["line_id", "line id abc.def"],
    ["handle", "แอดมา @someone99"],
    ["facebook", "https://www.facebook.com/some.page"],
    ["facebook", "ทักมาที่ m.me/somepage"],
    ["fb_cdn_image", "https://scontent.xx.fbcdn.net/v/t1.0-9/12345_n.jpg"],
    ["fb_cdn_image", "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1"],
    ["national_id", "1-2345-67890-12-1"],
    ["national_id", SYN.thaiId],
    ["national_id", SYN.thaiIdDash],
    ["address", "บ้านเลขที่ 12 หมู่ 3"],
    ["school", "เรียนโรงเรียนทดสอบวิทยา"],
  ];
  it.each(cases)("%s is detected", (cat, s) => expect(Object.keys(findPII(s))).toContain(cat));
  it("generic name forms, pronoun นาย, service handles and hotlines are not flagged", () => {
    expect(findPII("ชื่ออะไรคะ")).toEqual({});
    expect(findPII("พี่เจนชื่อเจนค่ะ")).toEqual({});
    expect(findPII("นายชอบอะไร")).toEqual({});
    expect(findPII("ทักไลน์ @teen_club", { allowHandles: ["@teen_club"] })).toEqual({});
    expect(findPII("โทร 1663 หรือ 1323 ฟรี 24 ชั่วโมง")).toEqual({});
    expect(findPII("โทร 1300 หรือ 1413")).toEqual({});
  });
  it("toArabic maps Thai digits 1:1 onto ASCII", () => {
    expect(toArabic(SYN.thaiMobile)).toBe("0812345678");
    expect(toArabic(SYN.thaiId)).toBe(SYN.id);
  });
  it("scrub replaces every hit with the summary.ts token", () => {
    const r = scrubPII("หนูชื่อสมศรี โทร 081-234-5678 ไลน์ไอดี: test_user99");
    expect(r.text).not.toMatch(/สมศรี|081|test_user99/);
    expect(r.text).toContain("[ลบข้อมูลส่วนตัว]");
    expect(r.categories).toEqual(expect.arrayContaining(["thai_name", "phone", "line_id"]));
  });
  it("scrub covers the original Thai-numeral span, not only the Arabic form", () => {
    const phone = scrubPII(`โทร ${SYN.thaiMobileDash} นะ`);
    expect(phone.categories).toContain("phone");
    expect(phone.text).not.toContain(SYN.thaiMobileDash);
    expect(phone.text).not.toContain("๐");
    expect(phone.text).toContain("[ลบข้อมูลส่วนตัว]");
    const id = scrubPII(`บัตร ${SYN.thaiIdDash}`);
    expect(id.categories).toContain("national_id");
    expect(id.text).not.toContain(SYN.thaiIdDash);
    expect(id.text).not.toContain("๑");
  });
  it("stripPII redacts Thai-numeral phones and IDs in the original span", () => {
    expect(stripPII(`โทร ${SYN.thaiMobileDash} นะ`)).not.toContain("๐");
    expect(stripPII(`บัตร ${SYN.thaiId}`)).not.toContain("๑");
    expect(stripPII(`โทร ${SYN.mobileDash}`)).not.toContain("1234");
    expect(stripPII("ประจำเดือนมาช้า ๒ อาทิตย์ อายุ ๑๗ ปี")).toBe("ประจำเดือนมาช้า ๒ อาทิตย์ อายุ ๑๗ ปี");
  });
  it("national ID checksum", () => {
    expect(nationalIdChecksumOk("1234567890121")).toBe(true);
    expect(nationalIdChecksumOk("1234567890123")).toBe(false);
    expect(nationalIdChecksumOk(SYN.thaiId)).toBe(true);
  });
  it("a synthetic bank file with PII or export keys fails the guard", () => {
    const bad = { topic_file: "x", cards: [{ id: "x.000", answer_th: "ติดต่อ 089 999 1234", source: [{ url: "https://facebook.com/x" }] }], usersays: [] };
    const cats = scanValue(bad, "synthetic.json", []).map((f: any) => f.category);
    expect(cats).toEqual(expect.arrayContaining(["phone", "facebook", "dialogflow_export_key"]));
  });
  it("a planted synthetic phone in a fixture card makes the guard fail without echoing the number", () => {
    const planted = { topic_file: "x", cards: [{ id: "fixture.plant.000", answer_th: `ติดต่อ ${SYN.mobileDash}` }] };
    const found = scanValue(planted, "planted.json", []);
    expect(found.map((f: any) => f.category)).toContain("phone");
    expectNoSynthetic(found.map((f: any) => formatFinding(f)));
  });
});

describe("guard walk: numbers, keys, redacted paths, parse errors", () => {
  it("scans a 13-digit national ID stored as a JSON number", () => {
    const found = scanValue({ cards: [{ id: "x.000", nid: 1234567890121 }] }, "num.json", []);
    expect(found.map((f: any) => f.category)).toContain("national_id");
    expectNoSynthetic(found.map((f: any) => formatFinding(f)));
  });
  it("scans object keys and redacts PII in the reported path", () => {
    const found = scanValue({ cards: [{ id: "x.000", [SYN.mobile]: "ok" }] }, "key.json", []);
    expect(found.map((f: any) => f.category)).toContain("phone");
    const report = found.map((f: any) => formatFinding(f)).join("\n");
    expectNoSynthetic(report);
    expect(report).toMatch(/\[redacted\]/);
  });
  it("JSON parse errors report file plus line/column only, never source text", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-bank-parse-"));
    const file = path.join(dir, "broken.json");
    fs.writeFileSync(file, `{\n  "answer_th": "โทร ${SYN.mobile}"\n`);
    expect(() => scanFile(file, [])).toThrow(/line\s+\d+.*column\s+\d+/i);
    try {
      scanFile(file, []);
    } catch (e) {
      const msg = String((e as Error).message);
      expect(msg).toMatch(/broken\.json/);
      expectNoSynthetic(msg);
      expect(msg).not.toContain("answer_th");
    }
  });
  it("cli report of a planted file never prints the synthetic value", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-bank-cli-"));
    fs.writeFileSync(path.join(dir, "planted.json"), JSON.stringify({ cards: [{ id: "x.000", answer_th: `โทร ${SYN.email}` }] }));
    const r = spawnSync(process.execPath, ["scripts/bank/guard.mjs", dir], { encoding: "utf8", cwd: ROOT });
    expect(r.status).toBe(1);
    expectNoSynthetic(`${r.stdout}\n${r.stderr}`);
    expect(r.stdout).toMatch(/email|phone|handle/i);
  });
});

describe("validator and logs never include matched PII", () => {
  const base = (): BankCard[] => JSON.parse(JSON.stringify(fixture.cards));
  const ctx = bankContext(undefined, "draft", "2026-10-22");
  const withCard = (patch: (c: BankCard) => void, i = 0) => { const cs = base(); patch(cs[i]); return cs; };

  it("phone_in_services message has no full number (kind, card, maybe mask only)", () => {
    const cards = withCard((c) => { c.answer_th = `ข้อความทดสอบ โทร ${SYN.mobile}`; }, 1);
    const issues = validateBank(cards, ctx).filter((i) => i.rule === "phone_in_services");
    expect(issues.length).toBeGreaterThan(0);
    const printed = issues.map(formatIssue).join("\n");
    expect(printed).toContain("phone_in_services");
    expect(printed).toContain(cards[1].id);
    expectNoSynthetic(printed, [SYN.mobile, "089111", "089"]);
  });
  it("unparseable link URL is not echoed in the error", () => {
    const leak = "https://%zz/secret99-user-path";
    const cards = withCard((c) => { c.links = [{ url: leak, label_th: "x" }]; }, 1);
    const issues = validateBank(cards, ctx).filter((i) => i.rule === "link_allowlist");
    expect(issues.length).toBeGreaterThan(0);
    const printed = issues.map(formatIssue).join("\n");
    expect(printed).not.toContain(leak);
    expect(printed).not.toContain("secret99");
    expect(printed).not.toContain("user:");
  });
});

describe("jsonParseError helper never includes source", () => {
  it("formats line and column only", () => {
    const raw = `{"tel":"${SYN.mobile}"}`;
    const err = new SyntaxError(`Unexpected token in JSON at position 2`);
    const wrapped = jsonParseError("tmp.json", err, raw);
    expect(wrapped.message).toMatch(/tmp\.json/);
    expect(wrapped.message).toMatch(/line\s+\d+/);
    expectNoSynthetic(wrapped.message);
  });
});
