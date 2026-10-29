import { describe, expect, it, vi } from "vitest";
import { BANK } from "../../src/core/bankData";
import { measureGroundedReplies } from "../../src/llm/chat-ground-measure";
import { GROUND_MEASURE_CASES } from "../fixtures/chat-ground-measure";

describe("grounded fixture-set measurement (no live model)", () => {
  it("runs trim + guard + fact check over the fixed set and reports a fallback rate", () => {
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

    const byId = new Map(r.rows.map((row) => [row.id, row]));
    expect(byId.get("keep-warm")?.accepted).toBe(true);
    expect(byId.get("fb-heat-condom")?.accepted).toBe(false);
    expect(byId.get("fb-parent-prep")?.accepted).toBe(false);
    expect(byId.get("fb-incomplete")?.accepted).toBe(false);
  });
});
