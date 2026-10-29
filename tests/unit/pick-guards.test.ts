import { describe, it, expect } from "vitest";
import { shouldForceRulesFallback } from "../../src/core/pick-guards";
import { BANK } from "../../src/core/bankData";
import { FALLBACK_ID, newDialog, runTurn, type TurnDeps } from "../../src/core/dialog";
import { retrieve } from "../../src/core/retrieve";
import { shippable } from "../../src/core/bank";
import type { CardPicker } from "../../src/core/pick-engine";

// SYNTHETIC questions only. Ids and pairings come from the V3 k=3 wrong-card audit.

function pool() {
  return BANK.filter((c) => shippable(c, "reviewed") && c.id !== FALLBACK_ID && c.id !== "general.welcome.000");
}

function pickerFor(id: string): CardPicker {
  return {
    ready: () => true,
    pick: async () => JSON.stringify({ id }),
  };
}

const deps = (picker: CardPicker): TurnDeps => ({
  cards: BANK, model: null, copyStatus: "reviewed", modelPick: true, cardPicker: picker, pickTimeoutMs: 80,
});

async function shown(q: string, modelId: string) {
  const r = await runTurn(newDialog("18-24"), q, deps(pickerFor(modelId)));
  if (r.reply.kind !== "card") throw new Error("expected card");
  return r.reply;
}

const CASES: { audit: string; rules: string; model: string; q: string }[] = [
  { audit: "j113", rules: "relationship.violence.001", model: "harassment.002", q: "โดนแฟนตี" },
  { audit: "j158", rules: "birth.control.000", model: "birth.control.implant.000", q: "อยากรู้เรื่องคุมกำเนิด" },
  { audit: "p04", rules: "ec.timing.b001", model: "condom.000", q: "ยาคุมฉุกเฉินทันไหม" },
  { audit: "p05", rules: "condom.leak.000", model: "pregnancy.abortion.001", q: "กลัวจะท้อง เพราะถุงยางรั่ว" },
  { audit: "p06", rules: "ec.timing.b001", model: "protection.pep.000", q: "ยาคุมฉุกเฉินทันไหม" },
  { audit: "p07", rules: "birth.control.000", model: "pregnancy.ec_ask.000", q: "อยากรู้เรื่องคุมกำเนิด" },
  { audit: "p12", rules: "hiv.test.under18.000", model: "pregnancy.notthetime.000", q: "อยากตรวจเอชไอวีโดยไม่บอกแฟน" },
];

describe("V3 post-check guards (risky audit pairs)", () => {
  it("forces rules-fallback for every risky id pair, either direction", () => {
    for (const c of CASES) {
      expect(shouldForceRulesFallback(c.rules, c.model), c.audit).toBe(true);
      expect(shouldForceRulesFallback(c.model, c.rules), `${c.audit} reverse`).toBe(true);
      expect(shouldForceRulesFallback(c.rules, c.rules), `${c.audit} same`).toBe(false);
    }
  });

  it("blocks abortion / PEP / not-the-time picks when rules retrieved nothing (p05, p06, p12 backup)", () => {
    expect(shouldForceRulesFallback(null, "pregnancy.abortion.001")).toBe(true);
    expect(shouldForceRulesFallback("", "protection.pep.000")).toBe(true);
    expect(shouldForceRulesFallback(undefined, "pregnancy.notthetime.000")).toBe(true);
    expect(shouldForceRulesFallback(null, "condom.000")).toBe(false);
    expect(shouldForceRulesFallback(null, "birth.control.implant.000")).toBe(false);
  });

  it("does not fire on a harmless neighbouring pair", () => {
    expect(shouldForceRulesFallback("disease.hiv.000", "disease.hiv.002")).toBe(false);
    expect(shouldForceRulesFallback("pregnancy.ornot.000", "pregnancy.signs.when.000")).toBe(false);
  });
});

describe("risky audit regressions (stub picker, flag on)", () => {
  it.each(CASES)("$audit: a model pick of $model falls back to the rules card", async (c) => {
    expect(BANK.some((card) => card.id === c.rules), c.rules).toBe(true);
    expect(BANK.some((card) => card.id === c.model), c.model).toBe(true);
    const top = retrieve(c.q, pool()).ranked[0]?.card.id;
    if (top === c.rules) {
      const r = await shown(c.q, c.model);
      expect(r.card.id, c.audit).toBe(c.rules);
      expect(r.engine, c.audit).toMatch(/^rules-/);
    } else {
      // Locked routes never call the model; the pair itself is still guarded.
      expect(shouldForceRulesFallback(c.rules, c.model), c.audit).toBe(true);
    }
  });
});
