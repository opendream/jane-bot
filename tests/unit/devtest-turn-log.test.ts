import { afterEach, describe, expect, it, vi } from "vitest";
import { stripPII } from "../../src/core/summary";
import type { TurnReply } from "../../src/core/dialog";
import { LAST_ARM_KEY } from "../../src/dev/arms";
import {
  LOG_KEY,
  clearLog,
  clearLogMemory,
  exportLogBlob,
  isLogEnabled,
  logState,
  recordTurn,
  restoreLog,
  setIncludeTyped,
  setLogEnabled,
  setLogStore,
} from "../../src/dev/turn-log";
import { promptIdForText, syntheticPrompts } from "../../src/dev/synthetic";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const meta = { arm: "A-tuned", sha: "abcd1234", runtime: "wasm", coldLoadMs: 12 };

function crisis(): TurnReply {
  return { kind: "crisis", categories: ["self_harm"], engine: "rules-crisis" };
}
function card(): TurnReply {
  return {
    kind: "card",
    card: { id: "birth.control.000" },
    text: "synthetic",
    reworded: false,
    via: "rules",
    banner: [],
    chips: [],
    offer: "none",
    offerIntents: ["other"],
    capNotice: null,
    engine: "model",
  } as TurnReply;
}

afterEach(() => {
  setLogStore(memoryStore());
  setLogEnabled(false);
  setIncludeTyped(false);
  clearLog();
});

describe("turn log (dev-test only)", () => {
  it("is off by default and writes nothing until opt-in", () => {
    const store = memoryStore();
    setLogStore(store);
    expect(isLogEnabled()).toBe(false);
    recordTurn("อยากรู้เรื่องคุมกำเนิด", card(), 3, meta);
    expect(logState().rows).toHaveLength(0);
    expect(store.getItem(LOG_KEY)).toBeNull();
  });

  it("opt-in is required before a row is stored; crisis rows have no text", () => {
    const store = memoryStore();
    setLogStore(store);
    setLogEnabled(true);
    recordTurn("ตอนนี้อยากตายมาก", crisis(), 1, meta);
    expect(logState().rows).toHaveLength(1);
    expect(logState().rows[0]!.crisis).toBe(true);
    expect(logState().rows[0]!.text).toBeUndefined();
    expect(logState().rows[0]!.promptId).toBeUndefined();
    expect(JSON.stringify(logState().rows[0])).not.toContain("อยากตาย");
  });

  it("stores synthetic prompt ids by default, not typed text", () => {
    setLogStore(memoryStore());
    setLogEnabled(true);
    const p = syntheticPrompts().find((x) => x.id === "h08")!;
    expect(promptIdForText(p.text)).toBe("h08");
    recordTurn(p.text, card(), 4, meta);
    expect(logState().rows[0]!.promptId).toBe("h08");
    expect(logState().rows[0]!.text).toBeUndefined();
    recordTurn("พิมพ์เอง โทร 081-234-5678", card(), 4, meta);
    expect(logState().rows[1]!.text).toBeUndefined();
    expect(logState().rows[1]!.promptId).toBeUndefined();
  });

  it("typed text is kept only with the second opt-in, and only after stripPII", () => {
    setLogStore(memoryStore());
    setLogEnabled(true);
    setIncludeTyped(true);
    const typed = "กลัวจะท้อง เพราะถุงยางรั่ว โทร 081-234-5678";
    recordTurn(typed, card(), 5, meta);
    expect(logState().rows[0]!.text).toBe(stripPII(typed));
    expect(logState().rows[0]!.text).not.toContain("081");
  });

  it("clear empties memory and localStorage", () => {
    const store = memoryStore();
    setLogStore(store);
    setLogEnabled(true);
    recordTurn("อยากรู้เรื่องคุมกำเนิด", card(), 2, meta);
    expect(store.getItem(LOG_KEY)).toBeTruthy();
    clearLog();
    expect(logState().rows).toHaveLength(0);
    restoreLog();
    expect(logState().rows).toHaveLength(0);
  });

  function seedTrace(store: ReturnType<typeof memoryStore>): void {
    store.setItem(LAST_ARM_KEY, "A-tuned");
    setLogStore(store);
    setLogEnabled(true);
    recordTurn("อยากรู้เรื่องคุมกำเนิด", card(), 2, meta);
    expect(store.getItem(LOG_KEY)).toBeTruthy();
  }

  function assertWipeLeavesNoRestorableLog(store: ReturnType<typeof memoryStore>): void {
    expect(logState().rows).toHaveLength(0);
    expect(store.getItem(LOG_KEY)).toBeNull();
    expect(store.getItem(LAST_ARM_KEY)).toBe("A-tuned");
    restoreLog();
    expect(logState().rows).toHaveLength(0);
    expect(store.getItem(LOG_KEY)).toBeNull();
  }

  it("erase chat removes jane.devtest.log so restoreLog cannot reload rows", () => {
    const store = memoryStore();
    seedTrace(store);
    clearLogMemory();
    assertWipeLeavesNoRestorableLog(store);
  });

  it("quick exit removes jane.devtest.log so restoreLog cannot reload rows", () => {
    const store = memoryStore();
    seedTrace(store);
    clearLogMemory();
    assertWipeLeavesNoRestorableLog(store);
  });

  it("export is a JSON blob and makes no network call", async () => {
    setLogStore(memoryStore());
    setLogEnabled(true);
    recordTurn("อยากรู้เรื่องคุมกำเนิด", card(), 2, meta);
    const fetchSpy = vi.fn();
    const xhrOpen = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", class { open = xhrOpen; send() {} });
    const blob = exportLogBlob();
    expect(blob.type).toContain("json");
    const text = await blob.text();
    expect(JSON.parse(text).rows).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
