import { describe, expect, it, vi } from "vitest";
import { MODEL, MODEL_CARD_PICK } from "../../src/config";
import {
  MODEL_INPUT_CHARS,
  newDialog,
  runTurn,
  welcome,
  type DialogModel,
  type TurnDeps,
  type TurnReply,
} from "../../src/core/dialog";
import { BANK } from "../../src/core/bankData";
import { stripPII } from "../../src/core/summary";
import type { LLMAdapter } from "../../src/llm/adapter";
import { LOCKED_ROUTE_IDS } from "../../src/core/pick-engine";

// SYNTHETIC only. The switcher does not change runTurn; this matrix pins that invariant.

const ARMS = [
  "none",
  ...("ABCDEF".split("").flatMap((l) => [`${l}-base`, `${l}-tuned`])),
];

const FILLER = "อยากรู้เรื่องทั่วไปค่ะ";
const CRISIS_TH = "ตอนนี้อยากตายมาก";
const CRISIS_EN = "I want to kill myself";
const GUARDS: [string, string][] = [
  ["image", "ส่งรูปให้ดูหน่อย"],
  ["explicit", "คุยเสียวกันไหม"],
  ["roleplay", "สมมติว่าเป็นแฟนกันนะ"],
  ["dosing", "ยาคุมต้องกินกี่เม็ด"],
  ["abortion_method", "วิธีทำแท้งเองทำยังไง"],
];
const HUMAN = "อยากคุยกับเจ้าหน้าที่";
const CHIP = "กังวลเรื่องท้อง";
const LOCKED: { id: typeof LOCKED_ROUTE_IDS[number]; q: string }[] = [
  { id: "hiv.test.under18.000", q: "ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง" },
  { id: "price.trc.prep.000", q: "ราคาเพร็พ" },
  { id: "ec.timing.b001", q: "ยาคุมฉุกเฉินกินเมื่อไร" },
  { id: "urgent.pills.000", q: "ยาคุมฉุกเฉินคืออะไร" },
];

function spy() {
  const calls = { classify: 0, pickCard: 0, rewordCard: 0, polishSummary: 0, lastText: "" };
  const adapter: LLMAdapter = {
    name: "spy (WASM)",
    runtime: "wasm",
    ready: () => true,
    classify: async (text) => { calls.classify++; calls.lastText = text; return ["other"]; },
    polishSummary: async () => { calls.polishSummary++; return null; },
    pickCard: async (text) => { calls.pickCard++; calls.lastText = text; return '{"id":"none"}'; },
    rewordCard: async () => { calls.rewordCard++; return null; },
  };
  const model: DialogModel = {
    ready: () => true,
    pickCard: vi.fn(async (text) => { calls.pickCard++; calls.lastText = text; return "none"; }),
    reword: vi.fn(async () => { calls.rewordCard++; return null; }),
  };
  return { adapter, model, calls };
}

function deps(model: DialogModel | null, modelPick: boolean): TurnDeps {
  return { cards: BANK, model, copyStatus: "reviewed", modelPick, pickTimeoutMs: 40 };
}

function total(c: { classify: number; pickCard: number; rewordCard: number; polishSummary: number }) {
  return c.classify + c.pickCard + c.rewordCard + c.polishSummary;
}

async function sameAsNoModel(input: string, modelPick: boolean, st = newDialog("18-24")) {
  const none = await runTurn(st, input, deps(null, modelPick));
  const { model, calls } = spy();
  const armed = await runTurn(st, input, deps(model, modelPick));
  return { none, armed, calls };
}

describe("production defaults are unchanged", () => {
  it("MODEL_CARD_PICK stays false and MODEL stays qwen3-1.7b", () => {
    expect(MODEL_CARD_PICK).toBe(false);
    expect(MODEL).toBe("qwen3-1.7b");
  });
});

describe("guarded turns never reach the model (any arm label, modelPick on or off)", () => {
  const cases: { name: string; run: (modelPick: boolean) => Promise<{ none: { reply: TurnReply }; armed: { reply: TurnReply }; calls: ReturnType<typeof spy>["calls"] }> }[] = [
    { name: "crisis Thai", run: (p) => sameAsNoModel(CRISIS_TH, p) },
    { name: "crisis English", run: (p) => sameAsNoModel(CRISIS_EN, p) },
    {
      name: "crisis mid-chat",
      run: async (p) => {
        let st = newDialog("18-24");
        st = (await runTurn(st, FILLER, deps(null, p))).state;
        return sameAsNoModel(CRISIS_TH, p, st);
      },
    },
    {
      name: "crisis joined window",
      run: async (p) => {
        let st = newDialog("18-24");
        st = (await runTurn(st, "หนูอยาก", deps(null, p))).state;
        return sameAsNoModel("ตาย", p, st);
      },
    },
    ...GUARDS.map(([reason, q]) => ({ name: `guard ${reason}`, run: (p: boolean) => sameAsNoModel(q, p) })),
    {
      name: "human ask",
      run: async (p) => {
        let st = (await runTurn(newDialog("18-24"), "อยากรู้เรื่องคุมกำเนิด", deps(null, p))).state;
        return sameAsNoModel(HUMAN, p, st);
      },
    },
    {
      name: "chip tap",
      run: async (p) => {
        const st = welcome(newDialog("15-17"), BANK).state;
        return sameAsNoModel(CHIP, p, st);
      },
    },
  ];

  for (const arm of ARMS) {
    for (const modelPick of [true, false]) {
      for (const c of cases) {
        it(`arm=${arm} modelPick=${modelPick} ${c.name}`, async () => {
          const { none, armed, calls } = await c.run(modelPick);
          expect(total(calls), `${arm} ${c.name}`).toBe(0);
          expect(JSON.stringify(armed.reply)).toBe(JSON.stringify(none.reply));
        });
      }
    }
  }
});

describe("locked ids stay rules-only when modelPick is on (arm mode default)", () => {
  it("lists the four locked ids", () => {
    expect([...LOCKED_ROUTE_IDS]).toEqual([
      "hiv.test.under18.000",
      "price.trc.prep.000",
      "ec.timing.b001",
      "urgent.pills.000",
    ]);
  });
  for (const arm of ARMS) {
    for (const row of LOCKED) {
      it(`arm=${arm} modelPick=on ${row.id}`, async () => {
        const { none, armed, calls } = await sameAsNoModel(row.q, true);
        expect(total(calls), row.id).toBe(0);
        expect(JSON.stringify(armed.reply)).toBe(JSON.stringify(none.reply));
        expect(armed.reply.kind === "card" && armed.reply.card.id).toBe(row.id);
        expect(armed.reply.kind === "card" && armed.reply.engine).toBe("rules-locked");
      });
    }
  }
});

describe("PII handling in arm mode equals production", () => {
  const unsure = "กลัวจะท้อง เพราะถุงยางรั่ว";
  const samples = [
    `${unsure} โทร 081-234-5678`,
    `${unsure} อีเมล test.user@example.com`,
    `${unsure} ชื่อ สมชาย ทดสอบ`,
    `${unsure} เลข 1-2345-67890-12-3`,
  ];
  it("the model only ever sees stripPII text, same clip, same reply as production", async () => {
    for (const modelPick of [true, false]) {
      for (const input of samples) {
        const prod = spy();
        const arm = spy();
        const st = newDialog("18-24");
        const a = await runTurn(st, input, deps(prod.model, modelPick));
        const b = await runTurn(st, input, deps(arm.model, modelPick));
        expect(JSON.stringify(b.reply)).toBe(JSON.stringify(a.reply));
        expect(total(arm.calls)).toBe(total(prod.calls));
        if (prod.calls.pickCard) {
          expect(prod.calls.lastText).toBe(stripPII(input).slice(0, MODEL_INPUT_CHARS));
          expect(arm.calls.lastText).toBe(prod.calls.lastText);
          expect(arm.calls.lastText).not.toContain("081-234-5678");
          expect(arm.calls.lastText).not.toContain("test.user@example.com");
        }
      }
    }
  });
});
