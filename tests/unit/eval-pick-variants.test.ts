import { describe, it, expect } from "vitest";
import { BANK } from "../../src/core/bankData";
import { pickUser } from "../../src/llm/prompts";
import { evalTurn, type EvalPicker } from "../../scripts/eval/model-first/harness";
import { stubPicker } from "../../scripts/eval/model-first/pickers";
import { isLockedCardId } from "../../scripts/eval/model-first/locked";
import { evalPickUser, HIV_UNDER18_ID, toShortlistItem } from "../../scripts/eval/model-first/variants";
import { scoreModelFirst } from "../../scripts/eval/model-first/metrics";

const cards = BANK;

function countingPicker(inner: EvalPicker): EvalPicker & { calls: number; lastShortlist: string[]; lastUser?: string } {
  const wrap: EvalPicker & { calls: number; lastShortlist: string[]; lastUser?: string } = {
    name: inner.name,
    calls: 0,
    lastShortlist: [],
    async pick(text, shortlist, prev, signal) {
      wrap.calls += 1;
      wrap.lastShortlist = shortlist.map((s) => s.id);
      return inner.pick(text, shortlist, prev, signal);
    },
    configure: inner.configure?.bind(inner),
  };
  return wrap;
}

describe("eval-only pick prompt (src/llm/prompts.ts untouched)", () => {
  it("titles-only evalPickUser matches src pickUser", () => {
    const sl = [
      { id: "condom.000", title_th: "ถุงยางใช้ได้จริงไหม" },
      { id: "condom.how_to.000", title_th: "วิธีใช้ถุงยาง" },
    ];
    expect(evalPickUser("ถุงยางใส่ยังไง", sl, null, { describe: false, fewShot: false })).toBe(
      pickUser("ถุงยางใส่ยังไง", sl, null),
    );
  });

  it("describe lines append the first reviewed key_fact in Thai", () => {
    const card = cards.find((c) => c.id === "condom.how_to.000")!;
    const sl = [toShortlistItem(card)];
    const user = evalPickUser("ใส่ถุงยางยังไง", sl, null, { describe: true });
    expect(user).toContain("วิธีใช้ถุงยาง — รูดถุงให้สุดถึงโคน");
    expect(user).toContain("condom.how_to.000");
  });
});

describe("V1 confident-agree still calls the model", () => {
  it("confident disagreement shows the rules card as rules-fallback with one model call", async () => {
    const picker = countingPicker(stubPicker("always-other"));
    const out = await evalTurn("เอชไอวีคืออะไร", {
      cards,
      picker,
      k: 5,
      confidentAgree: true,
    });
    expect(out.rulesConfident).toBe(true);
    expect(picker.calls).toBe(1);
    expect(out.modelCalls).toBe(1);
    expect(out.via).toBe("rules_fallback");
    expect(out.fallback).toBe(true);
    expect(out.modelShown).toBe(false);
    expect(out.cardId).toBe(out.rulesTop1);
    expect(out.modelPickId).toBe(picker.lastShortlist[1]);
    expect(out.modelPickId).not.toBe(out.rulesTop1);
  });

  it("unconfident turns still show the model pick", async () => {
    const picker = countingPicker(stubPicker("always-other"));
    const out = await evalTurn("วิธีใช้ถุงยาง", {
      cards,
      picker,
      k: 5,
      confidentAgree: true,
    });
    expect(out.rulesConfident).toBe(false);
    expect(picker.calls).toBe(1);
    expect(out.via).toBe("model");
    expect(out.modelShown).toBe(true);
    expect(out.cardId).toBe(picker.lastShortlist[1]);
  });
});

describe("lock-if-confident simulation (eval only)", () => {
  it("a confident locked top-1 still skips the model", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("คุมฉุกเฉิน", {
      cards,
      picker,
      k: 3,
      lockPolicy: "confident-only",
    });
    expect(out.rulesTop1).toBe("urgent.pills.000");
    expect(out.rulesConfident).toBe(true);
    expect(out.via).toBe("rules_locked");
    expect(picker.calls).toBe(0);
    expect(out.modelCalls).toBe(0);
  });

  it("a low-confidence locked top-1 goes to the shortlist and the model runs", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const out = await evalTurn("ยาคุมฉุกเฉินกินเมื่อไร", {
      cards,
      picker,
      k: 3,
      lockPolicy: "confident-only",
    });
    expect(out.rulesTop1).toBe("ec.timing.b001");
    expect(out.rulesConfident).toBe(false);
    expect(picker.calls).toBe(1);
    expect(out.shortlistIds).toContain("ec.timing.b001");
    expect(out.via).not.toBe("rules_locked");
  });

  it("always-lock still zeroes model calls on low-confidence locked top-1", async () => {
    const picker = countingPicker(stubPicker("always-other"));
    const out = await evalTurn("ยาคุมฉุกเฉินกินเมื่อไร", { cards, picker, k: 3 });
    expect(out.via).toBe("rules_locked");
    expect(picker.calls).toBe(0);
  });

  it("under-18 HIV privacy stays on hiv.test.under18.000 with stub top-1 under lock-if-confident", async () => {
    const picker = countingPicker(stubPicker("top1"));
    const q = "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง";
    const locked = await evalTurn(q, { cards, picker, k: 3, lockPolicy: "always" });
    const sim = await evalTurn(q, { cards, picker, k: 3, lockPolicy: "confident-only" });
    expect(locked.cardId).toBe(HIV_UNDER18_ID);
    expect(locked.modelCalls).toBe(0);
    expect(sim.cardId).toBe(HIV_UNDER18_ID);
    expect(sim.modelCalls).toBe(1);
    expect(sim.shortlistIds).toContain(HIV_UNDER18_ID);
    expect(isLockedCardId(HIV_UNDER18_ID)).toBe(true);
  });
});

describe("pick timeout", () => {
  it("records pickTimedOut and falls back to rules without hanging", async () => {
    const picker: EvalPicker = {
      name: "hang",
      pick(_t, _s, _p, signal) {
        return new Promise((_resolve, reject) => {
          const onAbort = () => reject(new Error("aborted"));
          if (signal?.aborted) return reject(new Error("aborted"));
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      },
    };
    const out = await evalTurn("เอชไอวีคืออะไร", { cards, picker, k: 3, timeoutMs: 40 });
    expect(out.pickTimedOut).toBe(true);
    expect(out.via).toBe("rules_fallback");
    expect(out.fallback).toBe(true);
    expect(out.modelCalls).toBe(1);
    expect(out.modelShown).toBe(false);
    expect(out.cardId).toBe(out.rulesTop1);
  });
});

describe("model-shown rate", () => {
  it("counts only non-locked free-text turns whose shown card is the model pick", () => {
    const m = scoreModelFirst([
      { label: "crisis", predicted: "crisis", modelCalls: 0, fallback: false, noCandidates: false, via: "crisis", cardId: null },
      { label: "ec.timing.b001", predicted: "ec.timing.b001", modelCalls: 0, fallback: false, noCandidates: false, via: "rules_locked", cardId: "ec.timing.b001", locked: true },
      { label: "disease.hiv.000", predicted: "disease.hiv.000", modelCalls: 1, fallback: false, noCandidates: false, via: "model", cardId: "disease.hiv.000", modelShown: true },
      { label: "disease.hiv.000", predicted: "disease.hiv.000", modelCalls: 1, fallback: true, noCandidates: false, via: "rules_fallback", cardId: "disease.hiv.000", modelShown: false },
    ]);
    expect(m.nNonLockedFreeText).toBe(2);
    expect(m.nModelShown).toBe(1);
    expect(m.modelShownRate).toBe(0.5);
    expect(m.noneRate).toBe(0);
  });
});
