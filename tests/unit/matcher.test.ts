import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BANK } from "../../src/core/bankData";
import { shippable } from "../../src/core/bank";
import { retrieve } from "../../src/core/retrieve";
import { FALLBACK_ID, WELCOME_ID, runTurn, newDialog, DialogSession, type TurnDeps } from "../../src/core/dialog";
import { MATCHER } from "../../src/config";
import {
  isMobileUserAgent,
  readMatcherFlag,
  matcherEnabled,
  noopMatcher,
  localMatcherDir,
  type IntentMatcher,
} from "../../src/core/matcher";
import { MATCHER_IMPL_ID, loadMatcher } from "../../src/matcher/load";
import baselineFile from "../fixtures/retrieve-c450-baseline.json";
import extraFile from "../fixtures/retrieve-routing-extra.json";

// All queries here are SYNTHETIC, written for these tests.

const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const deps = (extra: Partial<TurnDeps> = {}): TurnDeps => ({ cards: BANK, model: null, copyStatus: "reviewed", ...extra });
const pool = BANK.filter((c) => shippable(c, "reviewed") && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);

function cardStub(cardId: string): IntentMatcher {
  return { match: async () => ({ kind: "card", cardId }) };
}

function triggerMisroutes(): string[] {
  const out: string[] = [];
  for (const card of BANK) {
    if (card.review.status !== "approved" || !card.triggers.length) continue;
    if (card.id === FALLBACK_ID || card.id === WELCOME_ID) continue;
    for (const trigger of card.triggers) {
      const top = retrieve(trigger, pool).ranked[0]?.card.id ?? "(none)";
      if (top !== card.id) out.push(`${card.id}\t${trigger}\t${top}`);
    }
  }
  return out;
}

describe("matcher flag defaults off", () => {
  it("MATCHER is false so the shipped app stays on the rules router", () => {
    expect(MATCHER).toBe(false);
    expect(readMatcherFlag(MATCHER, "")).toBe(false);
    expect(readMatcherFlag(MATCHER, "?model=off")).toBe(false);
    expect(matcherEnabled(false, DESKTOP_UA)).toBe(false);
  });

  it("?matcher=1 enables only when the config/url flag is on and the UA is not a phone", () => {
    expect(readMatcherFlag(false, "?matcher=1")).toBe(true);
    expect(readMatcherFlag(false, "?matcher=on")).toBe(true);
    expect(readMatcherFlag(true, "?matcher=0")).toBe(false);
    expect(readMatcherFlag(true, "?matcher=off")).toBe(false);
    expect(matcherEnabled(true, DESKTOP_UA)).toBe(true);
  });
});

describe("phones never enable the matcher", () => {
  it("forces the flag off for mobile user agents even when matcher=1", () => {
    expect(isMobileUserAgent(IPHONE_UA)).toBe(true);
    expect(isMobileUserAgent(ANDROID_UA)).toBe(true);
    expect(isMobileUserAgent(IPAD_UA)).toBe(true);
    expect(isMobileUserAgent(DESKTOP_UA)).toBe(false);
    expect(matcherEnabled(true, IPHONE_UA)).toBe(false);
    expect(matcherEnabled(true, ANDROID_UA)).toBe(false);
    expect(matcherEnabled(true, IPAD_UA)).toBe(false);
    expect(matcherEnabled(readMatcherFlag(false, "?matcher=1"), IPHONE_UA)).toBe(false);
  });
});

describe("flag off: identical rules routing on the frozen corpus", () => {
  it("the 123-query baseline, post-EC extras, and #29 all-cards own-triggers still go through retrieve()", () => {
    expect(baselineFile.queries).toHaveLength(123);
    expect(extraFile.queries.filter((r) => r.group === "post_ec").length).toBeGreaterThanOrEqual(10);
    const found = triggerMisroutes();
    expect(found, found.join("\n")).toEqual([]);
  });

  it("runTurn without a matcher keeps crisis → retrieve → fallback, including the เริ่มใหม่ card", async () => {
    const crisis = await runTurn(newDialog(), "อยากตาย", deps());
    expect(crisis.reply.kind).toBe("crisis");
    const hit = await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิด", deps());
    expect(hit.reply.kind === "card" && hit.reply.card.id).toBe("birth.control.000");
    expect(hit.reply.kind === "card" && hit.reply.via === "matcher").toBe(false);
    const miss = await runTurn(newDialog(), "อยากรู้เรื่องทั่วไปค่ะ", deps());
    expect(miss.reply.kind === "card" && miss.reply.card.id).toBe(FALLBACK_ID);
    expect(miss.reply.kind === "card" && miss.reply.text).toBe("ตอนนี้พี่เจนยังไม่สามารถตอบเรื่องนั้นได้ค่ะ");
    expect(miss.reply.kind === "card" && miss.reply.chips.map((c) => c.label_th)).toEqual(["เริ่มใหม่"]);
  });
});

describe("flag on with a stub matcher: crisis rules still win", () => {
  it("a crisis query always returns the crisis card even if the stub picks a normal card", async () => {
    const stub = cardStub("urgent.pills.000");
    const r = await runTurn(newDialog(), "อยากตาย", deps({ matcher: stub }));
    expect(r.reply.kind).toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.categories).toContain("self_harm");
  });

  it("sexual-violence crisis also wins over a stub that always returns a bank card", async () => {
    const stub = cardStub("birth.control.000");
    const r = await runTurn(newDialog(), "ถูกข่มขืน", deps({ matcher: stub }));
    expect(r.reply.kind).toBe("crisis");
    if (r.reply.kind === "crisis") expect(r.reply.categories).toContain("sexual_violence");
  });

  it("when the stub abstains, the existing fallback card is shown (not rules retrieve)", async () => {
    const r = await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิด", deps({ matcher: noopMatcher }));
    expect(r.reply.kind === "card" && r.reply.card.id).toBe(FALLBACK_ID);
    expect(r.reply.kind === "card" && r.reply.via).toBe("fallback");
    expect(r.reply.kind === "card" && r.reply.text).toBe("ตอนนี้พี่เจนยังไม่สามารถตอบเรื่องนั้นได้ค่ะ");
    expect(r.reply.kind === "card" && r.reply.chips.map((c) => c.label_th)).toEqual(["เริ่มใหม่"]);
  });

  it("a stub card hit after a non-crisis line uses that card via matcher", async () => {
    const r = await runTurn(newDialog(), "อยากรู้เรื่องคุมกำเนิด", deps({ matcher: cardStub("birth.control.000") }));
    expect(r.reply.kind === "card" && r.reply.card.id).toBe("birth.control.000");
    expect(r.reply.kind === "card" && r.reply.via).toBe("matcher");
  });

  it("DialogSession.setMatcher injects the stub without changing crisis-first order", async () => {
    const session = new DialogSession("15-17", { cards: BANK, model: null, copyStatus: "reviewed" });
    session.setMatcher(cardStub("urgent.pills.000"));
    const crisis = await session.send("อยากตาย");
    expect(crisis?.kind).toBe("crisis");
  });
});

describe("matcher weights stay local and uncommitted", () => {
  it("rejects remote and parent-traversal paths; only a same-origin models/ dir is allowed", () => {
    expect(localMatcherDir("?matcherWeights=https://example.com/e5.onnx")).toBeNull();
    expect(localMatcherDir("?matcherWeights=http://127.0.0.1/models/matcher")).toBeNull();
    expect(localMatcherDir("?matcherWeights=//evil.example/x")).toBeNull();
    expect(localMatcherDir("?matcherWeights=../secrets")).toBeNull();
    expect(localMatcherDir("?matcherWeights=/etc/passwd")).toBeNull();
    expect(localMatcherDir("?matcherWeights=file:///tmp/x")).toBeNull();
    expect(localMatcherDir("")).toBe("models/matcher");
    expect(localMatcherDir("?matcherWeights=models/matcher")).toBe("models/matcher");
    expect(localMatcherDir("?matcherWeights=models/matcher/e5-small-int8")).toBe("models/matcher/e5-small-int8");
  });

  it("loadMatcher is a no-op stub (no network, no weights in-repo) and the impl id is unique", async () => {
    expect(MATCHER_IMPL_ID).toBe("JANE_MATCHER_E5_SMALL_INT8");
    const m = await loadMatcher({ search: "", probe: async () => false });
    expect(await m.match("อยากรู้เรื่องคุมกำเนิด")).toEqual({ kind: "abstain" });
  });
});

describe("default bundle does not contain matcher implementation", () => {
  const root = path.resolve(__dirname, "../..");
  const sources = [
    "src/main.ts",
    "src/core/dialog.ts",
    "src/ui/chat.ts",
    "src/config.ts",
    "src/llm/runtime.ts",
  ];

  it("app entry points never statically import the matcher loader", () => {
    for (const rel of sources) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src, rel).not.toMatch(/from ["'][^"']*matcher\/load["']/);
      expect(src, rel).not.toContain(MATCHER_IMPL_ID);
    }
    const main = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");
    expect(main).toMatch(/import\(["']\.\/matcher\/load["']\)/);
  });

  it("production index chunk omits the matcher impl id when dist exists", () => {
    const assets = path.join(root, "dist/assets");
    if (!fs.existsSync(assets)) return;
    const js = fs.readdirSync(assets).filter((f) => f.endsWith(".js") && !f.includes("load") && !f.includes("matcher"));
    const hits = js.filter((f) => fs.readFileSync(path.join(assets, f), "utf8").includes(MATCHER_IMPL_ID));
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
