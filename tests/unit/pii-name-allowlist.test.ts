import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fixture from "../fixtures/bank/valid-bank.json";
import { validateBank, type BankCard } from "../../src/core/bank";
import { bankContext, BANK } from "../../src/core/bankData";
import { scanDir, scanValue, formatFinding } from "../../scripts/bank/guard.mjs";
import { PII_NAME_ALLOWLIST } from "../../scripts/bank/pii-name-allowlist.mjs";

const ROOT = path.resolve(__dirname, "../..");
const BANK_DIR = path.resolve(__dirname, "../../src/data/bank");

/** SYNTHETIC personal names only. Never a real person's name. */
const SYN_THAI_NAME = "หนูชื่อสมศรีค่ะ";
const SYN_EN_NAME = "my name is Zorbalina";
const SYN_GLUE = "สมศรีทดสอบ";

const base = (): BankCard[] => JSON.parse(JSON.stringify(fixture.cards));
const reviewedCtx = (allowlist = PII_NAME_ALLOWLIST) =>
  ({ ...bankContext(undefined, "reviewed", "2026-10-27"), nameAllowlist: allowlist });
const draftCtx = (allowlist = PII_NAME_ALLOWLIST) =>
  ({ ...bankContext(undefined, "draft", "2026-10-27"), nameAllowlist: allowlist });

function approvedPlant(answer_th: string, id = "fixture.info.001"): BankCard[] {
  const cs = base();
  cs[1] = { ...cs[1], id, answer_th, key_facts: [], review: { status: "approved", reviewer: "Test Reviewer", reviewed_on: "2026-10-22" }, flags: ["pii_checked"] };
  cs[0].next = [{ label_th: "ไปต่อ", card_id: id }];
  return cs;
}

function piiRules(cards: BankCard[], ctx = reviewedCtx()) {
  return validateBank(cards, ctx).filter((i) => i.rule === "pii").map((i) => i.rule);
}

function guardFindings(cards: BankCard[], allowlist = PII_NAME_ALLOWLIST) {
  return scanValue({ cards }, "synthetic.json", [], { nameAllowlist: allowlist }) as { category: string }[];
}

describe("scoped PII name allowlist (synthetic data only)", () => {
  it("(a) all 35 current approved cards still validate clean", () => {
    const approved = BANK.filter((c) => c.review.status === "approved");
    expect(approved).toHaveLength(35);
    expect(approved.some((c) => c.id === "urgent.pills.000" && c.source_intents.includes("20200708.urgent.pills.0000"))).toBe(true);
    expect(PII_NAME_ALLOWLIST.filter((e) => e.id === "urgent.pills.000")).toEqual([]);
    expect(approved.every((c) => c.flags.includes("pii_checked"))).toBe(true);
    const issues = validateBank(BANK, reviewedCtx()).filter((i) => i.level === "error");
    expect(issues).toEqual([]);
    const found = scanDir(BANK_DIR, { requireFiles: true });
    expect(found.map((f: { file: string; path: string; category: string }) => formatFinding(f))).toEqual([]);
  });

  it("(b) a synthetic approved card with a fake Thai or English personal name fails bank:validate and guard", () => {
    for (const planted of [SYN_THAI_NAME, SYN_EN_NAME]) {
      const cards = approvedPlant(planted);
      expect(piiRules(cards), planted).toContain("pii");
      const cats = guardFindings(cards).map((f) => f.category);
      expect(cats.some((c) => c === "thai_name" || c === "english_name"), planted).toBe(true);
    }
  });

  it("(c) an allowlisted term on a different card is not exempt", () => {
    const span = PII_NAME_ALLOWLIST.find((e) => e.id === "disease.hiv.002" && e.span === "Self")!.span;
    const cards = approvedPlant(`ชุดตรวจ HIV ${span}-kit สำหรับการทดสอบ`, "fixture.other.000");
    expect(piiRules(cards)).toContain("pii");
    expect(guardFindings(cards).some((f) => f.category === "english_name")).toBe(true);
  });

  it("(d) removing an allowlist entry makes that card fail", () => {
    const entry = PII_NAME_ALLOWLIST.find((e) => e.id === "disease.hiv.002" && e.span === "Self")!;
    const filtered = PII_NAME_ALLOWLIST.filter((e) => e !== entry);
    const card = BANK.find((c) => c.id === entry.id)!;
    expect(piiRules(BANK, reviewedCtx())).toEqual([]);
    expect(piiRules(BANK, reviewedCtx(filtered))).toContain("pii");
    expect(guardFindings([card]).some((f) => f.category === "english_name")).toBe(false);
    expect(guardFindings([card], filtered).some((f) => f.category === "english_name")).toBe(true);
  });

  it("draft and unreviewed cards still fail name hits; the allowlist does not apply", () => {
    const cards = base();
    cards[0].answer_th = SYN_THAI_NAME;
    cards[0].key_facts = [];
    expect(cards[0].review.status).toBe("draft");
    expect(piiRules(cards, draftCtx())).toContain("pii");
    expect(guardFindings(cards).some((f) => f.category === "thai_name")).toBe(true);
  });

  it("each allowlist entry has a why comment and a card id that exists in the bank", () => {
    expect(PII_NAME_ALLOWLIST.length).toBeGreaterThan(0);
    for (const e of PII_NAME_ALLOWLIST) {
      expect(e.why.trim().length, e.span).toBeGreaterThan(8);
      expect(BANK.some((c) => c.id === e.id), e.id).toBe(true);
    }
  });

  it("an approved card that mentions โรงเรียน and มหาวิทยาลัย validates clean", () => {
    const cards = approvedPlant("ข้อความทดสอบ เรียนที่โรงเรียน และมหาวิทยาลัย ได้");
    expect(piiRules(cards)).toEqual([]);
  });

  it("a synthetic name glued to ชื่อพี่เจน fails bank:validate and guard", () => {
    const span = "ชื่อพี่เจน";
    const cards = JSON.parse(JSON.stringify(BANK)).map((c: BankCard) =>
      c.id === "general.welcome.000" ? { ...c, answer_th: c.answer_th.replace(span, span + SYN_GLUE) } : c,
    );
    expect(piiRules(cards)).toContain("pii");
    const card = cards.find((c: BankCard) => c.id === "general.welcome.000")!;
    expect(guardFindings([card]).some((f) => f.category === "thai_name" || f.category === "english_name")).toBe(true);
  });

  it("a synthetic name glued to an allowlisted span on disease.hiv.002 fails bank:validate and guard", () => {
    const span = "ชื่อ มีคลินิกนิรนาม";
    const cards = JSON.parse(JSON.stringify(BANK)).map((c: BankCard) =>
      c.id === "disease.hiv.002" ? { ...c, answer_th: c.answer_th.replace(span, span + SYN_GLUE) } : c,
    );
    expect(piiRules(cards)).toContain("pii");
    const card = cards.find((c: BankCard) => c.id === "disease.hiv.002")!;
    expect(guardFindings([card]).some((f) => f.category === "thai_name" || f.category === "english_name")).toBe(true);
  });

  it("unchanged general.welcome.000 and disease.hiv.002 still pass validate and guard", () => {
    expect(piiRules(BANK)).toEqual([]);
    for (const id of ["general.welcome.000", "disease.hiv.002"] as const) {
      const card = BANK.find((c) => c.id === id)!;
      const nameHits = guardFindings([card]).filter((f) => f.category === "thai_name" || f.category === "english_name");
      expect(nameHits, id).toEqual([]);
    }
  });
});

describe("allowlist file is the only exemption source", () => {
  it("guard CLI on a planted approved card with a synthetic name exits 1 and does not echo the name", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-pii-allow-"));
    fs.writeFileSync(path.join(dir, "planted.json"), JSON.stringify({
      topic_file: "x",
      cards: [{ id: "x.000", answer_th: SYN_EN_NAME, flags: ["pii_checked"], review: { status: "approved" } }],
    }));
    const r = spawnSync(process.execPath, ["scripts/bank/guard.mjs", dir], { encoding: "utf8", cwd: ROOT });
    expect(r.status).toBe(1);
    expect(`${r.stdout}\n${r.stderr}`).not.toContain("Zorbalina");
    expect(r.stdout).toMatch(/english_name/);
  });
});
