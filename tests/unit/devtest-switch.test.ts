import { describe, expect, it, vi } from "vitest";
import { switchArm, type SwitchStep } from "../../src/dev/switch-arm";

describe("switch order (abort → dispose → cache → navigate)", () => {
  it("aborts before dispose, waits for dispose before navigate, and never has two adapters", async () => {
    const order: SwitchStep[] = [];
    let adapters = 1;
    const abort = vi.fn(() => { /* session.abort */ });
    const dispose = vi.fn(async () => {
      expect(abort).toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 5));
      adapters -= 1;
      expect(adapters).toBe(0);
    });
    const navigate = vi.fn(() => {
      expect(dispose).toHaveBeenCalled();
      expect(adapters).toBe(0);
      adapters += 1; // the next page would load one model
    });
    await switchArm({
      abort,
      dispose,
      prepareCache: async () => { expect(dispose.mock.calls.length).toBe(1); },
      navigate,
      onStep: (s) => order.push(s),
    });
    expect(order).toEqual(["abort", "dispose", "cache", "navigate"]);
    expect(abort.mock.invocationCallOrder[0]!).toBeLessThan(dispose.mock.invocationCallOrder[0]!);
    expect(dispose.mock.invocationCallOrder[0]!).toBeLessThan(navigate.mock.invocationCallOrder[0]!);
    expect(adapters).toBe(1);
  });

  it("does not navigate until dispose resolves", async () => {
    let released: () => void = () => {};
    const gate = new Promise<void>((r) => { released = r; });
    const navigate = vi.fn();
    const run = switchArm({
      abort: () => {},
      dispose: () => gate,
      navigate,
    });
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
    released();
    await run;
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
