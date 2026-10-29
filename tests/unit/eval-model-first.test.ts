import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { FALLBACK_ID, WELCOME_ID } from "../../src/core/dialog";
import { AGE_REDIRECT_ID } from "../../src/core/age";
import {
  evalTurn,
  MODEL_FIRST_PICK_TIMEOUT_MS,
  type EvalPicker,
} from "../../scripts/eval/model-first/harness";
import { stubPicker } from "../../scripts/eval/model-first/pickers";
import { isLockedCardId, LOCKED_CARD_PREFIXES } from "../../scripts/eval/model-first/locked";
import { backupPool, backupShortlist, isCrisisCardId } from "../../scripts/eval/model-first/backup-shortlist";
import { scoreModelFirst } from "../../scripts/eval/model-first/metrics";
import type { BankCard } from "../../src/core/bank";

const cards = BANK;
const timeout = MODEL_FIRST_PICK_TIMEOUT_MS;

function countingPicker(inner: EvalPicker): EvalPicker & { calls: number; lastShortlist: string[] } {
  const wrap: EvalPicker & { calls: number; lastShortlist: string[] } = {
    name: inner.name,
    calls: 0,
    lastShortlist: [],
    async pick(text, shortlist, prev, signal) {
      wrap.calls += 1;
      wrap.lastShortlist = shortlist.map((s) => s.id);
      return inner.pick(text, shortlist, prev, signal);
    },
  };
  return wrap;
}

describe("locked-card policy", () => {
  it("locks HIV under-18 privacy, PrEP price, EC timing, and urgent-pills", () => {
    expect(isLockedCardId("hiv.test.under18.000")).toBe(true);
    expect(isLockedCardId("price.trc.prep.000")).toBe(true);
    expect(isLockedCardId("ec.timing.b001")).toBe(true);
    expect(isLockedCardId("urgent.pills.000")).toBe(true);
    expect(isLockedCardId("protection.prep.000")).toBe(false);
    expect(LOCKED_CARD_PREFIXES.some((p) => "ec.timing.b001".startsWith(p) || p === "ec.timing.")).toBe(true);
  });
});

describe("model-first harness: crisis / guard / chip make 0 model calls", () => {
  it("a crisis turn is rules-only with zero picker calls", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("ไม่อยากมีชีวิตอยู่แล้ว", { cards, picker, k: 5, timeoutMs: timeout });
    expect(out.kind).toBe("crisis");
    expect(out.label).toBe("crisis");
    expect(out.modelCalls).toBe(0);
    expect(picker.calls).toBe(0);
    expect(out.via).toBe("crisis");
  });

  it("an input-guard turn is rules-only with zero picker calls", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("ส่งรูปให้ดูได้ไหม", { cards, picker, k: 5, timeoutMs: timeout });
    expect(out.kind).toBe("guard");
    expect(out.modelCalls).toBe(0);
    expect(picker.calls).toBe(0);
  });

  it("a follow-up chip turn is rules-only with zero picker calls", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("อยากรู้", {
      cards,
      picker,
      k: 5,
      timeoutMs: timeout,
      pendingChips: [{ label_th: "อยากรู้", card_id: "ec.timing.b001" }],
    });
    expect(out.kind).toBe("card");
    expect(out.cardId).toBe("ec.timing.b001");
    expect(out.via).toBe("followup");
    expect(out.modelCalls).toBe(0);
    expect(picker.calls).toBe(0);
  });
});

describe("model-first harness: locked cards never reach the picker", () => {
  it("PrEP price is answered by rules with zero model calls", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("ราคาเพร็พ", { cards, picker, k: 5, timeoutMs: timeout });
    expect(out.cardId).toBe("price.trc.prep.000");
    expect(out.via).toBe("rules_locked");
    expect(out.modelCalls).toBe(0);
    expect(picker.calls).toBe(0);
  });

  it("HIV under-18 privacy is answered by rules with zero model calls", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง", { cards, picker, k: 5, timeoutMs: timeout });
    expect(out.cardId).toBe("hiv.test.under18.000");
    expect(out.via).toBe("rules_locked");
    expect(picker.calls).toBe(0);
  });

  it("EC timing is answered by rules with zero model calls", async () => {
    const picker = countingPicker(stubPicker("always-other"));
    const out = await evalTurn("ยาคุมฉุกเฉินกินเมื่อไร", { cards, picker, k: 5, timeoutMs: timeout });
    expect(out.cardId).toBe("ec.timing.b001");
    expect(out.via).toBe("rules_locked");
    expect(picker.calls).toBe(0);
  });

  it("urgent-pills is answered by rules with zero model calls", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("ยาคุมฉุกเฉินคืออะไร", { cards, picker, k: 5, timeoutMs: timeout });
    expect(out.cardId).toBe("urgent.pills.000");
    expect(out.via).toBe("rules_locked");
    expect(picker.calls).toBe(0);
  });
});

describe("stub picker modes", () => {
  it("top-1 picks the first shortlist id (non-locked, non-crisis)", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("เอชไอวีคืออะไร", { cards, picker, k: 5, timeoutMs: timeout });
    expect(picker.calls).toBe(1);
    expect(out.via).toBe("model");
    expect(out.cardId).toBe(picker.lastShortlist[0]);
    expect(out.agreeRulesTop1).toBe(true);
  });

  it("always-other picks index 1 when the shortlist has two or more", async () => {
    const picker = countingPicker(stubPicker("always-other"));
    const out = await evalTurn("เอชไอวีคืออะไร", { cards, picker, k: 5, timeoutMs: timeout });
    expect(picker.calls).toBe(1);
    expect(out.cardId).toBe(picker.lastShortlist[1]);
    expect(out.agreeRulesTop1).toBe(false);
  });

  it("forced-index 2 picks the third shortlist id", async () => {
    const picker = countingPicker(stubPicker("forced-index", 2));
    const out = await evalTurn("เอชไอวีคืออะไร", { cards, picker, k: 5, timeoutMs: timeout });
    expect(out.cardId).toBe(picker.lastShortlist[2]);
  });

  it("k=3 vs k=5 changes the shortlist length the picker sees", async () => {
    const p3 = countingPicker(stubPicker("top1"));
    const p5 = countingPicker(stubPicker("top1"));
    await evalTurn("เอชไอวีคืออะไร", { cards, picker: p3, k: 3, timeoutMs: timeout });
    await evalTurn("เอชไอวีคืออะไร", { cards, picker: p5, k: 5, timeoutMs: timeout });
    expect(p3.lastShortlist.length).toBeLessThanOrEqual(3);
    expect(p5.lastShortlist.length).toBeLessThanOrEqual(5);
    expect(p5.lastShortlist.length).toBeGreaterThanOrEqual(p3.lastShortlist.length);
  });
});

describe("model-first fallback on pick failure", () => {
  it("an invalid pick falls back to rules top-1 and records fallback", async () => {
    const picker: EvalPicker = {
      name: "junk",
      async pick() {
        return { id: null, raw: "not-json", latencyMs: 1, promptTokens: 10 };
      },
    };
    const counted = countingPicker(picker);
    const out = await evalTurn("เอชไอวีคืออะไร", { cards, picker: counted, k: 5, timeoutMs: timeout });
    expect(counted.calls).toBe(1);
    expect(out.via).toBe("rules_fallback");
    expect(out.fallback).toBe(true);
    expect(out.cardId).toBeTruthy();
    expect(isLockedCardId(out.cardId!)).toBe(false);
  });
});

describe("backup shortlist (eval only)", () => {
  it("the 35-card bank pool drops locked, crisis, and fallback cards and keeps the age gate", () => {
    const pool = backupPool(cards, "18-24");
    expect(pool.every((c) => !isLockedCardId(c.id))).toBe(true);
    expect(pool.every((c) => !isCrisisCardId(c.id))).toBe(true);
    expect(pool.some((c) => c.id === FALLBACK_ID)).toBe(false);
    expect(pool.length).toBeGreaterThan(0);
    const gated = { ...cards[0], id: "toy.adult.000", age_min: 18 as const };
    expect(backupPool([...cards, gated], "15-17").some((c) => c.id === gated.id)).toBe(false);
    expect(backupPool([...cards, gated], "18-24").some((c) => c.id === gated.id)).toBe(true);
  });

  it("excludes locked cards and crisis-style turns never consult it", async () => {
    const fake: BankCard[] = [
      { ...cards[0], id: "price.trc.prep.000", title_th: "ราคาเพร็พ", triggers: ["ราคาเพร็พ"], key_facts: ["270"] },
      { ...cards[0], id: "toy.prep.000", title_th: "เพร็พคืออะไร", triggers: ["เพร็พคืออะไร"], key_facts: ["กินวันละ 1 เม็ด"] },
      { ...cards[0], id: "toy.condom.000", title_th: "ถุงยาง", triggers: ["ถุงยางใช้ได้ไหม"], key_facts: ["98%"] },
    ];
    const list = backupShortlist("เพร็พคืออะไร", fake, { k: 3, age: "18-24" });
    expect(list.every((c) => !isLockedCardId(c.id))).toBe(true);
    expect(list.some((c) => c.id === "toy.prep.000")).toBe(true);
  });

  it("is used when rules have 0 candidates; recall@3 can surface the right card", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("วิธีใช้ถุง", { cards, picker, k: 5, timeoutMs: timeout, backup: true });
    expect(out.rulesCandidateCount).toBe(0);
    expect(out.backupUsed).toBe(true);
    expect(out.backupIds.length).toBeGreaterThan(0);
    expect(out.backupIds.length).toBeLessThanOrEqual(3);
    expect(out.backupIds.every((id) => !isLockedCardId(id))).toBe(true);
    expect(picker.calls).toBe(1);
  });

  it("does not run backup on crisis even when retrieve would be empty", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("อยากตาย", { cards, picker, k: 5, timeoutMs: timeout, backup: true });
    expect(out.kind).toBe("crisis");
    expect(out.backupUsed).toBe(false);
    expect(picker.calls).toBe(0);
  });
});

describe("age gate after a pick", () => {
  it("an 18+ pick for an under-18 user is a labelled fallback / redirect, not the 18+ card", async () => {
    const adult = cards.find((c) => c.triggers.length > 0)!;
    const gated: BankCard = {
      ...adult,
      id: "toy.adult_only.000",
      age_min: 18,
      flags: adult.flags.filter((f) => f !== "hotline" && f !== "hours"),
      referral: { offer: "none", intents: [] },
    };
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn(adult.triggers[0], {
      cards: [...cards, gated],
      picker,
      k: 5,
      timeoutMs: timeout,
      age: "15-17",
    });
    if (out.cardId === gated.id) {
      throw new Error("under-18 user must not keep an 18+ card");
    }
    expect(out.cardId === AGE_REDIRECT_ID || out.ageRedirect === true || out.fallback === true || out.cardId !== gated.id).toBe(true);
  });
});

describe("metrics helpers", () => {
  it("accuracy, wrong-card rate, crisis model-call count, fallback and no-candidate rates", () => {
    const rows = [
      { label: "crisis" as const, predicted: "crisis", modelCalls: 0, fallback: false, noCandidates: false, via: "crisis", cardId: null, locked: false },
      { label: "disease.hiv.000", predicted: "disease.hiv.000", modelCalls: 1, fallback: false, noCandidates: false, via: "model", cardId: "disease.hiv.000", locked: false },
      { label: "disease.hiv.000", predicted: "disease.hiv.001", modelCalls: 1, fallback: false, noCandidates: false, via: "model", cardId: "disease.hiv.001", locked: false },
      { label: "none" as const, predicted: "none", modelCalls: 0, fallback: true, noCandidates: true, via: "fallback", cardId: FALLBACK_ID, locked: false },
    ];
    const m = scoreModelFirst(rows);
    expect(m.n).toBe(4);
    expect(m.accuracy).toBe(0.75);
    expect(m.wrongCardRate).toBe(0.25);
    expect(m.crisisModelCalls).toBe(0);
    expect(m.fallbackRate).toBe(0.25);
    expect(m.noCandidateRate).toBe(0.25);
  });
});

describe("V3 policy in the eval harness", () => {
  it("describe: the picker shortlist carries the first key_fact", async () => {
    const inner = stubPicker("top1");
    const seen: { id: string; key_fact?: string }[] = [];
    const picker: EvalPicker = {
      name: "cap",
      async pick(text, shortlist, prev, signal) {
        seen.push(...shortlist);
        return inner.pick(text, shortlist, prev, signal);
      },
    };
    await evalTurn("อยากรู้เรื่องคุมกำเนิด", { cards, picker, k: 3, timeoutMs: timeout, describe: true });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((s) => !!s.key_fact)).toBe(true);
  });

  it("confident-agree: a different model pick on a confident turn is rules_fallback", async () => {
    const picker = countingPicker(stubPicker("always-other"));
    const out = await evalTurn("อยากรู้เรื่องคุมกำเนิด", {
      cards, picker, k: 3, timeoutMs: timeout, confidentAgree: true,
    });
    expect(picker.calls).toBe(1);
    expect(out.via).toBe("rules_fallback");
    expect(out.cardId).toBe("birth.control.000");
    expect(out.fallback).toBe(true);
  });

  it("post-check: IPV vs harassment (j113) falls back to the rules card", async () => {
    const picker: EvalPicker = {
      name: "j113",
      async pick(_t, shortlist) {
        const id = shortlist.find((s) => s.id.startsWith("harassment."))?.id ?? shortlist[1]?.id ?? "none";
        return { id, raw: JSON.stringify({ id }), latencyMs: 1, promptTokens: 1 };
      },
    };
    const out = await evalTurn("โดนแฟนตี", { cards, picker, k: 3, timeoutMs: timeout });
    expect(out.cardId).toBe("relationship.violence.001");
    expect(out.via).toBe("rules_fallback");
    expect(out.fallback).toBe(true);
  });
});

describe("welcome and fallback stay out of the rules pick pool", () => {
  it("does not offer WELCOME_ID or FALLBACK_ID to the model from rules retrieve", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("เอชไอวีคืออะไร", { cards, picker, k: 5, timeoutMs: timeout });
    expect(picker.lastShortlist).not.toContain(WELCOME_ID);
    expect(picker.lastShortlist).not.toContain(FALLBACK_ID);
    expect(out.rulesIds ?? picker.lastShortlist).toBeTruthy();
  });
});
