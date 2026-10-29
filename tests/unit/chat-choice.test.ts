import { describe, expect, it } from "vitest";
import { BANK } from "../../src/core/bankData";
import {
  encodeChatChoice,
  formatChatReply,
  parseChatChoice,
  renderChatChoice,
  type ChatChoiceBounds,
} from "../../src/llm/chat-choice";
import {
  CHAT_FOLLOWUPS_EN,
  CHAT_FOLLOWUPS_TH,
  CHAT_OPENERS_EN,
  CHAT_OPENERS_TH,
} from "../../src/llm/chat-voice";

const byId = (id: string) => {
  const c = BANK.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const CONDOM_LEAK = byId("condom.leak.000");
const PREP = byId("protection.prep.000");
const CONDOM = byId("condom.000");
const BIRTH = byId("birth.control.000");
const HIV = byId("disease.hiv.000");
const ORNOT = byId("pregnancy.ornot.000");

const CODEX_R1 = [
  "ถุงยางแตกแล้วให้นำไปอุ่นก่อนใช้นะ",
  "อายุสิบเก้าปีต้องมีผู้ปกครองไปด้วยถึงจะรับเพร็พได้นะ",
  "A nineteen year old needs a parent present to get PrEP.",
  "อายุสิบเก้าต้องให้คุณพ่อคุณแม่ไปด้วยนะคะ",
  "ต้องให้พ่อหรือแม่เซ็น",
  "ต้องพาผู้ใหญ่ไปด้วย",
  "ใส่ถุงยางสองชั้นจะปลอดภัยกว่านะคะ",
  "สวนช่องคลอดด้วยน้ำสบู่",
  "ดื่มยาคุมสองขวดนะ",
  "อายุสิบเก้าถึงรับเพร็พได้นะ",
  "ไปศิริราชเลยนะ",
  "อยู่เชียงใหม่ได้นะ",
] as const;

const CODEX_R2 = [
  "เชื้อเอชไอวีไม่สามารถติดต่อได้ทางเลือดนะคะ",
  "ยาคุมกันโรคได้ค่ะ",
  "เพร็พไม่ต้องกินกันไว้ก่อนนะคะ",
  "ใช้วาสลีนเป็นสารหล่อลื่นได้นะคะ",
  "เพร็พสามารถลดโอกาสในการติดเชื้อเอชไอวีได้สามในสี่ค่ะ",
] as const;

/** Round 3: moved negations, dropped conditions, one-word opposites, unknown negators. */
const CODEX_R3 = [
  "เอชไอวี เป็นเชื้อไวรัสชนิดหนึ่งที่ไม่ทำลายระบบภูมิคุ้มกันของร่างกาย",
  "จะป้องกันการท้องได้ 98% เลย",
  "เพร็พเพิ่มความเสี่ยงได้ค่ะ",
  "เพร็พมิต้องกินกันไว้ก่อนนะคะ",
  "ยาคุมกันท้องไม่ได้ แต่กันโรคได้นะ",
  "ถุงยางไม่เวิร์กสุดแล้ว ณ เวลานี้",
] as const;

const ORNOT_SAFE_ALONE = "แบบนี้ถือว่าเซฟประมาณนึงแล้ว ยังไม่ต้องกังวลมากนะ";
const ORNOT_RISK_ALONE = "แบบนี้ถือว่ามีความเสี่ยงหมดเลย";
const ORNOT_INTACT = "ลองย้อนนึกดูก่อน ถ้าใช้ถุงยางโดยที่ถุงไม่แตก ไม่รั่ว หรือกินยาคุมครบตามจำนวนไม่มีตกหล่น";

function bounds(hasCard: boolean): ChatChoiceBounds {
  return {
    openerCount: CHAT_OPENERS_TH.length,
    followUpCount: CHAT_FOLLOWUPS_TH.length,
    hasCard,
  };
}

function cardBodyOf(text: string, opener: string, follow: string): string | null {
  const none = formatChatReply(opener, "", follow);
  if (text === none) return "";
  const prefix = `${opener} `;
  const suffix = ` ${follow}`;
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) return null;
  return text.slice(prefix.length, text.length - suffix.length);
}

function isWholeCardOrNone(text: string, opener: string, follow: string, answer: string): boolean {
  const body = cardBodyOf(text, opener, follow);
  return body === "" || body === answer;
}

describe("parseChatChoice (strict whole-card flag)", () => {
  it("accepts a short JSON object with o, c, q", () => {
    const r = parseChatChoice('{"o":0,"c":0,"q":1}', bounds(true));
    expect(r).toEqual({ ok: true, choice: { o: 0, c: 0, q: 1 } });
  });

  it("accepts c=1 only when a card is present", () => {
    const r = parseChatChoice('{"o":1,"c":1,"q":0}', bounds(true));
    expect(r).toEqual({ ok: true, choice: { o: 1, c: 1, q: 0 } });
  });

  it("rejects the old subset-selection shape", () => {
    expect(parseChatChoice('{"o":0,"s":[2],"q":0}', bounds(true)).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"s":[1,3],"q":0}', bounds(true)).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"s":[],"q":0}', bounds(true)).ok).toBe(false);
    expect(parseChatChoice('{"o":1,"s":[2,0],"q":0}', bounds(true)).ok).toBe(false);
  });

  it("rejects bad JSON, truncated output, and trailing text", () => {
    expect(parseChatChoice("not json", bounds(true)).ok).toBe(false);
    expect(parseChatChoice("{", bounds(true)).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":1', bounds(true)).ok).toBe(false);
    expect(parseChatChoice("", bounds(true)).ok).toBe(false);
    expect(parseChatChoice("null", bounds(true)).ok).toBe(false);
    expect(parseChatChoice("[]", bounds(true)).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":0,"q":0} extra', bounds(false)).ok).toBe(false);
  });

  it("rejects extra keys, missing keys, and wrong types", () => {
    const b = bounds(true);
    expect(parseChatChoice('{"o":0,"c":0,"q":0,"text":"เพร็พลดความเสี่ยงได้ค่ะ"}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":0,"q":0,"s":[]}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0.5,"c":0,"q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":"0","c":0,"q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":true,"q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":"1","q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":1.5,"q":0}', b).ok).toBe(false);
  });

  it("rejects out-of-range ids and c other than 0 or 1", () => {
    const b = bounds(true);
    expect(parseChatChoice('{"o":9,"c":0,"q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":0,"q":9}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":2,"q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":-1,"q":0}', b).ok).toBe(false);
    expect(parseChatChoice('{"o":-1,"c":0,"q":0}', b).ok).toBe(false);
  });

  it("rejects c=1 when there is no card", () => {
    expect(parseChatChoice('{"o":0,"c":1,"q":0}', bounds(false)).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"c":0,"q":0}', bounds(false)).ok).toBe(true);
  });
});

describe("renderChatChoice (whole card or none)", () => {
  it("c=1 renders opener, then the exact full answer_th, then the follow-up", () => {
    const text = renderChatChoice({ o: 0, c: 1, q: 0 }, "th", CONDOM.answer_th);
    expect(text).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, CONDOM.answer_th, CHAT_FOLLOWUPS_TH[0]!));
    expect(cardBodyOf(text, CHAT_OPENERS_TH[0]!, CHAT_FOLLOWUPS_TH[0]!)).toBe(CONDOM.answer_th);
  });

  it("c=0 renders opener plus follow-up only", () => {
    const text = renderChatChoice({ o: 0, c: 0, q: 1 }, "th", CONDOM.answer_th);
    expect(text).toBe(formatChatReply(CHAT_OPENERS_TH[0]!, "", CHAT_FOLLOWUPS_TH[1]!));
    expect(text).not.toContain(CONDOM.answer_th);
    expect(cardBodyOf(text, CHAT_OPENERS_TH[0]!, CHAT_FOLLOWUPS_TH[1]!)).toBe("");
  });

  it("c=1 copies this card only — never another card's text", () => {
    const text = renderChatChoice({ o: 0, c: 1, q: 0 }, "th", CONDOM_LEAK.answer_th);
    expect(text).toContain(CONDOM_LEAK.answer_th);
    expect(text).not.toContain(PREP.answer_th);
  });
});

describe("Codex pregnancy.ornot.000 subset examples cannot happen", () => {
  it("old s=[2] and s=[1,3] JSON is unparseable", () => {
    expect(parseChatChoice('{"o":0,"s":[2],"q":0}', bounds(true)).ok).toBe(false);
    expect(parseChatChoice('{"o":0,"s":[1,3],"q":0}', bounds(true)).ok).toBe(false);
  });

  it("no accepted render is the เซฟ line alone or intact-condom plus ความเสี่ยง", () => {
    for (let o = 0; o < CHAT_OPENERS_TH.length; o++) {
      for (let q = 0; q < CHAT_FOLLOWUPS_TH.length; q++) {
        const opener = CHAT_OPENERS_TH[o]!;
        const follow = CHAT_FOLLOWUPS_TH[q]!;
        const none = renderChatChoice({ o, c: 0, q }, "th", ORNOT.answer_th);
        const whole = renderChatChoice({ o, c: 1, q }, "th", ORNOT.answer_th);
        expect(none).not.toContain(ORNOT_SAFE_ALONE);
        expect(none).not.toContain(ORNOT_RISK_ALONE);
        expect(whole).toBe(formatChatReply(opener, ORNOT.answer_th, follow));
        expect(whole).toContain(ORNOT_SAFE_ALONE);
        expect(whole).toContain(ORNOT_INTACT);
        expect(whole).toContain(ORNOT_RISK_ALONE);
        expect(whole).not.toBe(formatChatReply(opener, ORNOT_SAFE_ALONE, follow));
        expect(whole).not.toBe(formatChatReply(opener, `${ORNOT_INTACT} ${ORNOT_RISK_ALONE}`, follow));
        expect(isWholeCardOrNone(none, opener, follow, ORNOT.answer_th)).toBe(true);
        expect(isWholeCardOrNone(whole, opener, follow, ORNOT.answer_th)).toBe(true);
      }
    }
  });
});

describe("Codex round-1 / round-2 / round-3 examples are impossible", () => {
  const b = bounds(true);

  it.each([...CODEX_R1])("round 1 %s is not a valid choice", (line) => {
    expect(parseChatChoice(line, b).ok).toBe(false);
  });

  it.each([...CODEX_R2])("round 2 %s is not a valid choice", (line) => {
    expect(parseChatChoice(line, b).ok).toBe(false);
  });

  it.each([...CODEX_R3])("round 3 %s is not a valid choice", (line) => {
    expect(parseChatChoice(line, b).ok).toBe(false);
  });

  it("no accepted render of those lines can appear as a factual sentence", () => {
    const plants = [...CODEX_R1, ...CODEX_R2, ...CODEX_R3];
    for (const card of [CONDOM, CONDOM_LEAK, PREP, BIRTH, HIV]) {
      for (const plant of plants) {
        expect(plant === card.answer_th, `${card.id} ${plant}`).toBe(false);
        for (let o = 0; o < CHAT_OPENERS_TH.length; o++) {
          for (let q = 0; q < Math.min(2, CHAT_FOLLOWUPS_TH.length); q++) {
            const none = renderChatChoice({ o, c: 0, q }, "th", card.answer_th);
            const whole = renderChatChoice({ o, c: 1, q }, "th", card.answer_th);
            expect(none === plant).toBe(false);
            expect(whole === plant).toBe(false);
          }
        }
      }
    }
  });
});

describe("property: rendered text is opener, then nothing or the exact full answer_th, then follow-up", () => {
  function mulberry32(seed: number) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("random model outputs either fail parse or render whole card or none", () => {
    const rng = mulberry32(42);
    const cards = [CONDOM, CONDOM_LEAK, PREP, BIRTH, HIV, ORNOT, byId("general.fallback.000")];
    const garbage = [
      "",
      "{",
      "[]",
      "hello",
      '{"o":0}',
      '{"o":0,"s":[0,0],"q":0}',
      '{"o":0,"s":[2],"q":0}',
      '{"o":0,"s":[1,3],"q":0}',
      '{"o":99,"c":0,"q":0}',
      '{"o":0,"c":1,"q":0,"x":1}',
      '{"o":0,"c":2,"q":0}',
      ...CODEX_R1,
      ...CODEX_R2,
      ...CODEX_R3,
    ];
    for (const card of cards) {
      const b = bounds(true);
      for (const g of garbage) {
        const parsed = parseChatChoice(g, b);
        if (parsed.ok) {
          const text = renderChatChoice(parsed.choice, "th", card.answer_th);
          expect(
            isWholeCardOrNone(text, CHAT_OPENERS_TH[parsed.choice.o]!, CHAT_FOLLOWUPS_TH[parsed.choice.q]!, card.answer_th),
            g,
          ).toBe(true);
        }
      }
      for (let i = 0; i < 80; i++) {
        const o = Math.floor(rng() * 12);
        const q = Math.floor(rng() * 12);
        const c = Math.floor(rng() * 4) - 1;
        const withS = rng() < 0.25;
        const raw = withS
          ? JSON.stringify({ o, s: [Math.floor(rng() * 5), Math.floor(rng() * 5)], q })
          : JSON.stringify({ o, c, q });
        const parsed = parseChatChoice(raw, b);
        if (!parsed.ok) continue;
        const text = renderChatChoice(parsed.choice, "th", card.answer_th);
        const opener = CHAT_OPENERS_TH[parsed.choice.o]!;
        const follow = CHAT_FOLLOWUPS_TH[parsed.choice.q]!;
        expect(isWholeCardOrNone(text, opener, follow, card.answer_th), raw).toBe(true);
        expect(text.startsWith(opener)).toBe(true);
        expect(text.endsWith(follow)).toBe(true);
        if (parsed.choice.c === 0) {
          expect(text).toBe(formatChatReply(opener, "", follow));
          expect(text).not.toContain(card.answer_th);
        } else {
          expect(parsed.choice.c).toBe(1);
          expect(text).toBe(formatChatReply(opener, card.answer_th, follow));
          expect(cardBodyOf(text, opener, follow)).toBe(card.answer_th);
        }
      }
    }
  });

  it("every valid choice is opener + nothing or exact answer_th + follow-up", () => {
    for (let o = 0; o < CHAT_OPENERS_TH.length; o++) {
      for (let q = 0; q < CHAT_FOLLOWUPS_TH.length; q++) {
        const none = renderChatChoice({ o, c: 0, q }, "th", CONDOM.answer_th);
        expect(none).toBe(formatChatReply(CHAT_OPENERS_TH[o]!, "", CHAT_FOLLOWUPS_TH[q]!));
        const whole = renderChatChoice({ o, c: 1, q }, "th", CONDOM.answer_th);
        expect(whole).toBe(formatChatReply(CHAT_OPENERS_TH[o]!, CONDOM.answer_th, CHAT_FOLLOWUPS_TH[q]!));
      }
    }
    const en = renderChatChoice({ o: 0, c: 0, q: 0 }, "en", "");
    expect(en).toBe(formatChatReply(CHAT_OPENERS_EN[0]!, "", CHAT_FOLLOWUPS_EN[0]!));
  });

  it("encodeChatChoice round-trips o, c, q and never emits s", () => {
    const json = encodeChatChoice({ o: 2, c: 1, q: 1 });
    expect(json).toBe('{"o":2,"c":1,"q":1}');
    expect(json).not.toContain('"s"');
    const parsed = parseChatChoice(json, bounds(true));
    expect(parsed).toEqual({ ok: true, choice: { o: 2, c: 1, q: 1 } });
  });
});
