import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-ignore plain JS modules shared with the Node scripts
import { readExport, mergeExports, cleanMessages, stripLinks, medicalFlags, toQueueItem, normPhrase, topicFor } from "../../scripts/bank/df-lib.mjs";
// @ts-ignore
import { runImport, buildReviewedCards } from "../../scripts/bank/import-df.mjs";
// @ts-ignore
import { triggerOverlap } from "../../scripts/bank/check-triggers.mjs";

// SYNTHETIC fixtures only (tests/fixtures/df/make-fixtures.mjs). No real export or user text.
const FX = path.resolve(__dirname, "../fixtures/df");
const REPO = path.resolve(__dirname, "../..");
let out: string;
let res: any;

beforeAll(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "jane-queue-test-"));
  res = runImport({ bot: path.join(FX, "bot"), jane: path.join(FX, "jane"), out, now: new Date("2026-10-22T14:00:00Z") });
});

describe("import + merge (synthetic exports)", () => {
  it("counts: unique, overlap, identical, conflicts, jane-only", () => {
    const s = res.summary;
    expect(s.intents).toEqual({ bot: 8, jane: 4, unique: 9, overlap: 3, identical: 1, bot_only: 5, jane_only: 1 });
    expect(s.conflicts).toEqual(["Default Fallback Intent", "Default Welcome Intent"]);
    expect(s.jane_only).toEqual(["test.janeonly.000"]);
  });
  it("conflicting intents keep both versions for the reviewer", () => {
    const w = res.queue.find((q: any) => q.intent === "Default Welcome Intent");
    expect(w.review.conflict).toBe(true);
    expect(Object.keys(w.conflict_variants)).toEqual(["bot", "jane"]);
  });
  it("phrases: union per intent; whitespace-insensitive duplicates across context-free intents are phrase conflicts", () => {
    const { merged, stats } = mergeExports(readExport(path.join(FX, "bot"), "bot"), readExport(path.join(FX, "jane"), "jane"));
    const w = merged.find((r: any) => r.name === "Default Welcome Intent");
    expect(w.phrases.map(normPhrase).sort()).toEqual(["ดีจ้า", "สวัสดี", "หวัดดี"].sort());
    expect(stats.phraseConflicts).toBe(1);
    expect(merged.find((r: any) => r.name === "test.dup.000").phraseConflicts).toEqual([["test.pii.000"]]);
    // context-dependent yes/no replies are kept, scoped to their parent, and are not conflicts
    expect(merged.find((r: any) => r.name === "test.ec.000 - yes").phraseConflicts).toEqual([]);
  });
  it("every queue item is needs-review with a draft card that has no copied triggers", () => {
    expect(res.queue).toHaveLength(9);
    for (const q of res.queue) {
      expect(q.status).toBe("needs-review");
      expect(q.proposed_card.review.status).toBe("draft");
      expect(q.proposed_card.triggers).toEqual([]);
      expect(q.proposed_card.flags).toContain("fb_payload_removed");
      expect(q.proposed_card.licence).toBe("unreviewed");
      expect(q.proposed_card.licence).not.toBe("CC-BY-SA-4.0");
      expect(q.proposed_card).not.toHaveProperty("age_min");
    }
  });
  it("real import path: Approved row with only proposed_card keeps id, content and age_min", () => {
    const item = res.queue.find((q: any) => q.intent === "test.ec.000");
    expect(item.proposed_card).toBeTruthy();
    expect(item.proposed_card).not.toHaveProperty("age_min");
    const [built] = buildReviewedCards([{ ...item, status: "Approved", audience: "18+ only" }]);
    expect(built.id).toBe(item.proposed_card.id);
    expect(built.answer_th).toBe(item.proposed_card.answer_th);
    expect(built.flags).toEqual(item.proposed_card.flags);
    expect(built.source_intents).toEqual(item.proposed_card.source_intents);
    expect(built.age_min).toBe(18);
    const [all15] = buildReviewedCards([{ ...item, status: "Edit", audience: "All (15+)" }]);
    expect(all15.age_min).toBe(15);
    expect(all15.answer_th).toBe(item.proposed_card.answer_th);
  });
  it("real import path: blank Audience on an Approved imported row fails (no default)", () => {
    const item = res.queue.find((q: any) => q.intent === "test.ec.000");
    expect(() => buildReviewedCards([{ ...item, status: "Approved", audience: "" }])).toThrow(/audience/i);
    expect(() => buildReviewedCards([{ ...item, status: "Edit", audience: "   " }])).toThrow(/audience/i);
    expect(() => buildReviewedCards([{ ...item, status: "Approved", audience: null }])).toThrow(/audience/i);
  });
});

describe("stripping payloads, images and links", () => {
  const ec = () => res.queue.find((q: any) => q.intent === "test.ec.000");
  it("drops FB cards, buttons, images; quick replies become chips; LINE text counted", () => {
    const q = ec();
    expect(q.stripped).toMatchObject({ cards: 1, buttons: 2, images: 2, linePayloads: 1, shortLinks: 1, facebookLinks: 1, linkCandidates: 1 });
    expect(q.chips_th).toEqual(["ใช่", "ไม่ใช่"]);
  });
  it("no URL, short link, FB or image host survives in the text", () => {
    const blob = JSON.stringify(res.queue.map((q: any) => [q.responses_th, q.chips_th, q.conflict_variants]));
    expect(blob).not.toMatch(/https?:|tinyurl|facebook\.com|fbcdn|giphy|m\.me\//);
  });
  it("allow-listed links are kept aside as candidates to re-check", () => expect(ec().link_candidates).toEqual(["https://rsathai.org/test"]));
  it("stripLinks counts by kind", () => {
    const c = { shortLinks: 0, imageLinks: 0, facebookLinks: 0, otherLinks: 0, linkCandidates: 0 };
    const r = stripLinks("ก bit.ly/x ข https://example.com/y ค https://i.giphy.com/a.gif", c);
    expect(r.text).toBe("ก ข ค");
    expect(c).toMatchObject({ shortLinks: 1, otherLinks: 1, imageLinks: 1 });
  });
  it("cleanMessages de-duplicates text across platforms", () => {
    const m = (platform: string) => ({ platform, type: "text", speech: ["ซ้ำ"], replies: [], title: "", subtitle: "", imageUrl: "", buttons: [], payload: null });
    expect(cleanMessages([m("facebook"), m("default")]).texts).toEqual(["ซ้ำ"]);
  });
});

describe("PII flag (not redact) and review flags", () => {
  it("PII in responses is flagged, not redacted; hits go to a private file", () => {
    const q = res.queue.find((q: any) => q.intent === "test.pii.000");
    expect(q.pii.count).toBeGreaterThan(0);
    expect(q.pii.categories).toEqual(expect.arrayContaining(["phone", "school"]));
    expect(q.review.pii_check).toBe("hits-flagged");
    expect(q.responses_th.join(" ")).toContain("081-234-5678");
    expect(q.responses_th.join(" ")).toContain("โรงเรียนทดสอบวิทยา");
    expect(q.responses_th.join(" ")).not.toContain("[ลบข้อมูลส่วนตัว]");
    const hits = fs.readFileSync(path.join(out, "pii-hits.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(hits.some((h: any) => h.intent === "test.pii.000" && h.category === "phone")).toBe(true);
    const st = fs.statSync(path.join(out, "pii-hits.jsonl"));
    expect(st.mode & 0o077).toBe(0); // owner-only
  });
  it("training phrases in the staging copy stay as imported", () => {
    const rows = fs.readFileSync(path.join(out, "intents.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(JSON.stringify(rows)).toContain("ทดลอง");
    expect(JSON.stringify(rows)).not.toContain("[ลบข้อมูลส่วนตัว]");
  });
  it("medical-review flags (same categories as the scan)", () => {
    expect(medicalFlags("x", ["ยาคุมฉุกเฉิน ภายใน 72 ชั่วโมง"])).toEqual(expect.arrayContaining(["emergency_contraception", "contraception_dosing"]));
    expect(medicalFlags("info.how_abort.1", ["ข้อความ"])).toContain("abortion_info");
    expect(medicalFlags("x", ["สวัสดี"])).toEqual([]);
    const jo = res.queue.find((q: any) => q.intent === "test.janeonly.000");
    expect(jo.review.medical_review).toBe(true);
    expect(jo.proposed_card.flags).toEqual(expect.arrayContaining(["medical", "hotline"]));
    expect(jo.proposed_card.reword).toBe(false); // hotline → verbatim only
  });
  it("topic guess from intent names", () => {
    expect(topicFor("20200708.urgent.pills.0000")).toBe("emergency_contraception");
    expect(topicFor("disease.HIV.001")).toBe("sti_hiv");
    expect(topicFor("default.ending.byejane")).toBe("ending");
  });
});

/** Build a tiny SYNTHETIC Dialogflow-format export (no real user text). */
function writeMiniExport(root: string, label: string, intents: { name: string; speech: string[]; phrases?: string[]; replies?: string[] }[]) {
  const dir = path.join(root, label);
  fs.mkdirSync(path.join(dir, "intents"), { recursive: true });
  fs.writeFileSync(path.join(dir, "agent.json"), JSON.stringify({ description: "SYNTHETIC", language: "th", displayName: label }));
  for (const it of intents) {
    const messages: Record<string, unknown>[] = [
      { type: "0", title: "", textToSpeech: "", lang: "th", speech: it.speech, condition: "" },
    ];
    if (it.replies) messages.push({ type: "2", platform: "facebook", title: "เลือก", replies: it.replies, textToSpeech: "", lang: "th", condition: "" });
    const j = {
      id: `id-${it.name}`, name: it.name, auto: true, contexts: [],
      responses: [{ resetContexts: false, action: "", affectedContexts: [], parameters: [], messages, speech: [] }],
      priority: 500000, webhookUsed: false, webhookForSlotFilling: false, fallbackIntent: false,
      events: [], conditionalResponses: [], condition: "", conditionalFollowupEvents: [],
    };
    fs.writeFileSync(path.join(dir, "intents", `${it.name}.json`), JSON.stringify(j));
    const phrases = it.phrases ?? [];
    if (phrases.length) {
      fs.writeFileSync(path.join(dir, "intents", `${it.name}_usersays_th.json`), JSON.stringify(phrases.map((p, i) => ({
        id: `u${i}`, data: [{ text: p, userDefined: false }], isTemplate: false, count: 0, lang: "th", updated: 0,
      }))));
    }
  }
  return dir;
}

describe("importer flags findPII name spans and does not redact (synthetic)", () => {
  it("keeps English and Thai name forms in the queue and intents.jsonl", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jane-df-names-"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-queue-names-"));
    const phrases = ["call me Somchai", "นายสมชายทดสอบ"];
    const bot = writeMiniExport(root, "bot", [{ name: "test.names.000", speech: phrases, phrases }]);
    const jane = writeMiniExport(root, "jane", []);
    const r = runImport({ bot, jane, out: outDir });
    const q = r.queue.find((x: any) => x.intent === "test.names.000");
    const blob = JSON.stringify([q.responses_th, q.proposed_card.answer_th]) + fs.readFileSync(path.join(outDir, "intents.jsonl"), "utf8");
    expect(blob).toContain("Somchai");
    expect(blob).toContain("สมชายทดสอบ");
    expect(blob).not.toContain("[ลบข้อมูลส่วนตัว]");
    expect(q.pii.count).toBeGreaterThan(0);
    expect(q.review.pii_check).toBe("hits-flagged");
  });
});

describe("importer flags strip spans findPII misses (synthetic)", () => {
  const cases: [string, string][] = [
    ["test.flag.ighandle.000", "ไอจี somchai_99"],
    ["test.flag.igcolon.000", "ig: some.user"],
    ["test.flag.nick.000", "ชื่อเล่นว่า ส้มโอ"],
    ["test.flag.school.000", "รร.สมมติวิทยา"],
    ["test.flag.addr.000", "อยู่ ต.บางสมมติ อ.เมือง"],
    ["test.flag.plus1.000", "+1 415 555 0134"],
    ["test.flag.passport.000", "AA1234567"],
    ["test.flag.queryurl.000", "ดูต่อที่ https://example.com/secret?q=1"],
    ["test.flag.schemeless.000", "example.com/x"],
    ["test.flag.igpath.000", "instagram.com/fakeuser99"],
  ];

  it("each format produces a pii-hits line and is hits-flagged, without redacting", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jane-df-stripflag-"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-queue-stripflag-"));
    const bot = writeMiniExport(root, "bot", cases.map(([name, text]) => ({ name, speech: [text], phrases: [text] })));
    const jane = writeMiniExport(root, "jane", []);
    const r = runImport({ bot, jane, out: outDir });
    const hits = fs.readFileSync(path.join(outDir, "pii-hits.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const intentsBlob = fs.readFileSync(path.join(outDir, "intents.jsonl"), "utf8");
    for (const [name, text] of cases) {
      const q = r.queue.find((x: any) => x.intent === name);
      expect(q.review.pii_check, name).toBe("hits-flagged");
      expect(q.pii.count, name).toBeGreaterThan(0);
      expect(hits.some((h: any) => h.intent === name), name).toBe(true);
      expect(hits.filter((h: any) => h.intent === name).every((h: any) => h.kind), name).toBeTruthy();
      expect(JSON.stringify([q.responses_th, q.proposed_card.answer_th]) + intentsBlob, name).toContain(text.split(/\s+/).pop()!);
      expect(JSON.stringify(q.responses_th), name).not.toContain("[ลบข้อมูลส่วนตัว]");
    }
  });
});

describe("importer allowed handles vs other handles (synthetic)", () => {
  it("an allowed handle glued to nickname, address or ?passport= is flagged; the handle alone is not", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jane-df-glue-"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-queue-glue-"));
    const glued: [string, string][] = [
      ["test.glue.nick.000", "@teen_clubชื่อเล่นว่าส้มโอ"],
      ["test.glue.addr.000", "@teen_clubต.บางสมมติ"],
      ["test.glue.passport.000", "https://example.com/@teen_club?passport=AA1234567"],
    ];
    const bot = writeMiniExport(root, "bot", [
      ...glued.map(([name, text]) => ({ name, speech: [text], phrases: [text] })),
      { name: "test.glue.solo.000", speech: ["@teen_club"], phrases: ["@teen_club"] },
    ]);
    const jane = writeMiniExport(root, "jane", []);
    const r = runImport({ bot, jane, out: outDir });
    const hits = fs.readFileSync(path.join(outDir, "pii-hits.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    for (const [name] of glued) {
      const q = r.queue.find((x: any) => x.intent === name);
      expect(q.review.pii_check, name).toBe("hits-flagged");
      expect(q.pii.count, name).toBeGreaterThan(0);
      expect(hits.some((h: any) => h.intent === name), name).toBe(true);
      expect(JSON.stringify(q.responses_th), name).not.toContain("[ลบข้อมูลส่วนตัว]");
    }
    const solo = r.queue.find((x: any) => x.intent === "test.glue.solo.000");
    expect(solo.review.pii_check).toBe("no-hits-sample-10pct");
    expect(solo.pii.count).toBe(0);
    expect(hits.some((h: any) => h.intent === "test.glue.solo.000")).toBe(false);
  });
  it("keeps every handle as imported; only a non-allowed handle is flagged", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jane-df-hnd-"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-queue-hnd-"));
    const bot = writeMiniExport(root, "bot", [
      { name: "test.handle.ok.000", speech: ["แอดไลน์ @teen_club"], phrases: ["แอดไลน์ @teen_club"] },
      { name: "test.handle.bad.000", speech: ["แอดไลน์ @random_user99"], phrases: ["แอดไลน์ @random_user99"] },
    ]);
    const jane = writeMiniExport(root, "jane", []);
    const r = runImport({ bot, jane, out: outDir });
    const ok = r.queue.find((x: any) => x.intent === "test.handle.ok.000");
    const bad = r.queue.find((x: any) => x.intent === "test.handle.bad.000");
    const intentsBlob = fs.readFileSync(path.join(outDir, "intents.jsonl"), "utf8");
    expect(ok.responses_th.join(" ")).toContain("@teen_club");
    expect(ok.pii.count).toBe(0);
    expect(bad.responses_th.join(" ")).toContain("@random_user99");
    expect(bad.responses_th.join(" ")).not.toContain("[ลบข้อมูลส่วนตัว]");
    expect(bad.pii.count).toBeGreaterThan(0);
    expect(intentsBlob).toContain("@teen_club");
    expect(intentsBlob).toContain("@random_user99");
  });
});

describe("conflict: medical flag and Jane chips from either variant", () => {
  it("sets medical_review if Jane's variant is flagged and unions Jane's quick replies", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jane-df-conflict-"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-queue-conflict-"));
    const bot = writeMiniExport(root, "bot", [{
      name: "test.conflict.000", speech: ["สวัสดีทดสอบ"], replies: ["คุยต่อ"], phrases: ["ทักทายทดสอบ"],
    }]);
    const jane = writeMiniExport(root, "jane", [{
      name: "test.conflict.000", speech: ["ตรวจเอชไอวีได้ ทดสอบ"], replies: ["คุยต่อ", "ถามหมอ"], phrases: ["ทักทายทดสอบ"],
    }]);
    const r = runImport({ bot, jane, out: outDir });
    const q = r.queue.find((x: any) => x.intent === "test.conflict.000");
    expect(q.review.conflict).toBe(true);
    expect(q.review.medical_review).toBe(true);
    expect(q.review.medical_flags).toEqual(expect.arrayContaining(["hiv_treatment_testing"]));
    expect(q.chips_th).toEqual(["คุยต่อ", "ถามหมอ"]);
  });
});

describe("output stays outside git", () => {
  it("refuses to write the queue inside the repo", () => {
    expect(() => runImport({ bot: path.join(FX, "bot"), jane: path.join(FX, "jane"), out: path.join(REPO, "tmp-queue") })).toThrow(/outside/);
    expect(fs.existsSync(path.join(REPO, "tmp-queue"))).toBe(false);
  });
  it("rejects a ..x-style name that is still inside the repo", () => {
    const sneaky = path.join(REPO, "..x-review-queue-test");
    try {
      expect(() => runImport({ bot: path.join(FX, "bot"), jane: path.join(FX, "jane"), out: sneaky })).toThrow(/outside/);
      expect(fs.existsSync(sneaky)).toBe(false);
    } finally {
      fs.rmSync(sneaky, { recursive: true, force: true });
    }
  });
  it("rejects a symlink that points into the repo", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jane-out-link-"));
    const link = path.join(tmp, "into-repo");
    const target = path.join(REPO, "tmp-queue-via-symlink");
    fs.symlinkSync(target, link);
    try {
      expect(() => runImport({ bot: path.join(FX, "bot"), jane: path.join(FX, "jane"), out: link })).toThrow(/outside/);
      expect(fs.existsSync(target)).toBe(false);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it("writes the four staging files with owner-only permissions", () => {
    for (const f of ["intents.jsonl", "review-queue.jsonl", "pii-hits.jsonl", "summary.json"]) expect(fs.statSync(path.join(out, f)).mode & 0o077).toBe(0);
  });
  it("re-applies mode 0600 when rewriting an existing pii-hits.jsonl", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-queue-chmod-"));
    const hits = path.join(outDir, "pii-hits.jsonl");
    fs.writeFileSync(hits, "{}\n", { mode: 0o644 });
    fs.chmodSync(hits, 0o644);
    runImport({ bot: path.join(FX, "bot"), jane: path.join(FX, "jane"), out: outDir });
    expect(fs.statSync(hits).mode & 0o777).toBe(0o600);
  });
  it("fails with a clear error on a symlink cycle (does not hang)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jane-out-loop-"));
    const a = path.join(tmp, "a");
    const b = path.join(tmp, "b");
    fs.symlinkSync(b, a);
    fs.symlinkSync(a, b);
    const started = Date.now();
    expect(() => runImport({ bot: path.join(FX, "bot"), jane: path.join(FX, "jane"), out: a })).toThrow(/symlink|cycle|loop/i);
    expect(Date.now() - started).toBeLessThan(2000);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it(".gitignore covers the exports and the private queue", () => {
    const gi = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
    expect(gi).toMatch(/^jane-df\*\/$/m);
    expect(gi).toMatch(/^jane-private\/$/m);
  });
  it("trigger check flags a trigger equal to an export phrase (whitespace-insensitive)", () => {
    const keys = new Set(["ลืมกินยา"]);
    expect(triggerOverlap([{ id: "a.000", triggers: ["ลืม กินยา"] }, { id: "b.000", triggers: ["ยาคุม"] }], keys)).toEqual(["a.000"]);
  });
});

// Optional: the real exports, counts only. Runs when JANE_DF_DIR points at the off-repo export folder.
const DF = process.env.JANE_DF_DIR;
describe.skipIf(!DF)("real exports (local only, counts only)", () => {
  it("405 unique, 127 overlap (125 identical), 2 conflicts, 18 jane-only", () => {
    const { stats } = mergeExports(readExport(path.join(DF!, "sex-safe-safe-bot"), "bot"), readExport(path.join(DF!, "sex-safe-safe-jane"), "jane"));
    expect([stats.unique, stats.overlap, stats.identical, stats.janeOnly.length]).toEqual([405, 127, 125, 18]);
    expect(stats.conflicts).toEqual(["Default Fallback Intent", "Default Welcome Intent"]);
  });
});
