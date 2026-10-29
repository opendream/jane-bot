import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { llamaPicker, type EvalPicker } from "../../scripts/eval/model-first/pickers";

const mockWorker = path.resolve(__dirname, "../fixtures/eval/mock_llama_worker.py");
const shortlist = [
  { id: "card.slow.000", title_th: "ช้า" },
  { id: "card.fast.000", title_th: "เร็ว" },
];

function mockPicker(): EvalPicker {
  return llamaPicker({
    workerArgv: ["python3", mockWorker],
    workerEnv: { MOCK_DELAY_MS: "250", MOCK_DELAY_TOKEN: "DELAY" },
  });
}

describe("llama picker: abort must not leak a late reply into the next pick", () => {
  let picker: EvalPicker | null = null;
  afterEach(() => {
    picker?.close?.();
    picker = null;
  });

  it("a timed-out pick's late worker line is ignored; the next pick gets its own answer", async () => {
    picker = mockPicker();
    const ac = new AbortController();
    const slow = picker.pick("DELAY FIRST", shortlist, null, ac.signal);
    await new Promise((r) => setTimeout(r, 40));
    ac.abort();
    await expect(slow).rejects.toThrow(/aborted/);

    const fast = await picker.pick("SECOND", shortlist, null);
    expect(fast.id).toBe("card.fast.000");
    expect(fast.raw).toContain("card.fast.000");
    expect(fast.raw).not.toContain("card.slow.000");
  });

  it("without abort, a delayed first pick still returns its own id", async () => {
    picker = mockPicker();
    const slow = await picker.pick("DELAY FIRST", shortlist, null);
    expect(slow.id).toBe("card.slow.000");
  });
});
