import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { measureGroundedReplies } from "../../src/llm/chat-ground-measure";
import { GROUND_MEASURE_CASES } from "../fixtures/chat-ground-measure";

describe("grounded fixture-set measurement (no live model)", () => {
  it("runs structured parse + chatGuard over the fixed set and reports a fallback rate per arm", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = measureGroundedReplies(GROUND_MEASURE_CASES, BANK);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();

    expect(r.total).toBe(GROUND_MEASURE_CASES.length);
    expect(r.accepted + r.fallback).toBe(r.total);
    expect(r.fallbackRate).toBe(r.fallback / r.total);
    expect(r.accepted).toBeGreaterThan(0);
    expect(r.fallback).toBeGreaterThan(0);

    expect(r.byArm.choice.total).toBeGreaterThan(0);
    expect(r.byArm.invalid.total).toBeGreaterThan(0);
    expect(r.byArm.choice.accepted).toBe(r.byArm.choice.total);
    expect(r.byArm.choice.fallbackRate).toBe(0);
    expect(r.byArm.invalid.accepted).toBe(0);
    expect(r.byArm.invalid.fallbackRate).toBe(1);

    const byId = new Map(r.rows.map((row) => [row.id, row]));
    expect(byId.get("keep-warm")?.accepted).toBe(true);
    expect(byId.get("keep-condom-s0")?.accepted).toBe(true);
    expect(byId.get("keep-leak-s0")?.accepted).toBe(true);
    expect(byId.get("keep-no-card")?.accepted).toBe(true);
    expect(byId.get("fb-heat-condom")?.accepted).toBe(false);
    expect(byId.get("fb-parent-prep")?.accepted).toBe(false);
    expect(byId.get("fb-incomplete")?.accepted).toBe(false);
    expect(byId.get("fb-bad-json")?.accepted).toBe(false);
    expect(byId.get("fb-out-of-range")?.accepted).toBe(false);
    expect(byId.get("fb-duplicate-ids")?.accepted).toBe(false);
    expect(byId.get("fb-no-card-sentence")?.accepted).toBe(false);
  });
});
