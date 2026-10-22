import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-ignore plain JS module shared with the Node scripts
import { findPII, scrubPII, nationalIdChecksumOk } from "../../scripts/bank/pii-patterns.mjs";
// @ts-ignore
import { scanDir, scanValue } from "../../scripts/bank/guard.mjs";

const BANK_DIR = path.resolve(__dirname, "../../src/data/bank");

describe("committed bank files contain no PII and no Dialogflow export data", () => {
  it("src/data/bank/*.json scan is clean (names, phones, emails, LINE/FB ids, national ID, facebook.com, FB CDN)", () => {
    const found = scanDir(BANK_DIR);
    // Report location and category only, never the text.
    expect(found.map((f: any) => `${f.file} ${f.path} ${f.category}`)).toEqual([]);
  });
  it("every committed bank file is listed (no stray non-JSON data files)", () => {
    const files = fs.existsSync(BANK_DIR) ? fs.readdirSync(BANK_DIR) : [];
    expect(files.filter((f) => !f.endsWith(".json"))).toEqual([]);
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
    ["email", "ส่งมาที่ someone@example.com"],
    ["line_id", "ไลน์ไอดี: test_user99"],
    ["line_id", "line id abc.def"],
    ["handle", "แอดมา @someone99"],
    ["facebook", "https://www.facebook.com/some.page"],
    ["facebook", "ทักมาที่ m.me/somepage"],
    ["fb_cdn_image", "https://scontent.xx.fbcdn.net/v/t1.0-9/12345_n.jpg"],
    ["fb_cdn_image", "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1"],
    ["national_id", "1-2345-67890-12-1"],
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
  });
  it("scrub replaces every hit with the summary.ts token", () => {
    const r = scrubPII("หนูชื่อสมศรี โทร 081-234-5678 ไลน์ไอดี: test_user99");
    expect(r.text).not.toMatch(/สมศรี|081|test_user99/);
    expect(r.text).toContain("[ลบข้อมูลส่วนตัว]");
    expect(r.categories).toEqual(expect.arrayContaining(["thai_name", "phone", "line_id"]));
  });
  it("national ID checksum", () => {
    expect(nationalIdChecksumOk("1234567890121")).toBe(true);
    expect(nationalIdChecksumOk("1234567890123")).toBe(false);
  });
  it("a synthetic bank file with PII or export keys fails the guard", () => {
    const bad = { topic_file: "x", cards: [{ id: "x.000", answer_th: "ติดต่อ 089 999 1234", source: [{ url: "https://facebook.com/x" }] }], usersays: [] };
    const cats = scanValue(bad, "synthetic.json", []).map((f: any) => f.category);
    expect(cats).toEqual(expect.arrayContaining(["phone", "facebook", "dialogflow_export_key"]));
  });
});
