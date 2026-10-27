import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { detectCrisis } from "../../src/core/crisis";
import { detectCrisisWithExtra, EXTRA_CONTEXTUAL, matchCrisisExtra } from "../../src/core/crisis-extra";
import { crisisCallNowLine } from "../../src/core/crisis-order";
import type { CrisisCategory } from "../../src/core/types";
import { classifyNeed } from "../../src/core/intent";
import { compact } from "../../src/core/text";
import { visibleStrings } from "../../src/core/bank";
import { BANK, BANK_FIXTURES } from "../../src/core/bankData";
import { runTurn, newDialog, type TurnDeps } from "../../src/core/dialog";
import seed from "../../evals/seed-set.json";
import quiz from "../../src/data/bank/quiz.json";
import fpSet from "../../evals/crisis-fp-set.json";

/**
 * Iteration-3 contextual patterns + mental-health routing.
 * All Thai strings here are SYNTHETIC, written for the tests. No real user text.
 */

function squashHit(text: string, cat: CrisisCategory, id: string): boolean {
  const extra = EXTRA_CONTEXTUAL[cat] ?? [];
  const row = extra.find((x) => x.id === id);
  if (!row) return false;
  return row.re.test(compact(text));
}

const POSITIVES: { id: string; cat: CrisisCategory; text: string }[] = [
  { id: "agent_hits", cat: "violence_danger", text: "ผัวซ้อมหนูเมื่อคืน" },
  { id: "victim_hit", cat: "violence_danger", text: "โดนซ้อมจนตัวเขียว" },
  { id: "force_words", cat: "violence_danger", text: "บ้านนี้มีความรุนแรงในครอบครัว" },
  { id: "threat", cat: "violence_danger", text: "เขาข่มขู่หนูทุกวัน" },
  { id: "harass_generic", cat: "violence_danger", text: "มีคนสะกดรอยตามจากโรงเรียน" },
  { id: "harass_sexual", cat: "sexual_violence", text: "เพื่อนร่วมงานแทะโลมหนู" },
  { id: "victim_touch", cat: "sexual_violence", text: "โดนจับหน้าอกบนรถเมล์" },
  { id: "image_threat", cat: "sexual_violence", text: "เขาขู่จะปล่อยคลิปหนู" },
  { id: "covert_photo", cat: "sexual_violence", text: "มีคนแอบถ่ายในห้องน้ำ" },
  { id: "nonpartner_touch", cat: "sexual_violence", text: "ลุงจับก้นหนู" },
];

const SOFT: string[] = [
  "ไม่สบายใจ",
  "เหนื่อยใจ",
  "อึดอัด",
  "เครียด",
  "วันนี้ไม่สบายใจเลย",
  "หนูเหนื่อยใจนิดหน่อย",
  "รู้สึกอึดอัดในห้อง",
  "ช่วงนี้เครียดเรื่องสอบ",
];

/** Everyday compounds the HIT / force lookbehinds exclude, plus a few with an agent so lookaheads are proven. */
const LOOKALIKES: string[] = [
  "หนูไปตีตั๋วหนัง",
  "ตีความข้อสอบไม่ถูก",
  "เขาตีความบทนี้ต่างจากหนู",
  "เพิ่งตีสนิทกับเพื่อนใหม่",
  "อย่าตีกินกันเลย",
  "ทั้งคู่ตีจากกันเมื่อปีก่อน",
  "ตีหน้าไม่ออกเลยวันนี้",
  "ร้านนี้ตีราคาสูงไป",
  "บทความนี้เพิ่งตีพิมพ์",
  "อย่าตีเนียนหนีงาน",
  "เมื่อวานตีมึนจนดึก",
  "เด็กๆ ตีลังกาเล่น",
  "ท่อนำไข่ตีบต้องไปหาหมอไหม",
  "นัดกันตีหนึ่งที่ปากซอย",
  "นัดกันตีสองที่ร้าน",
  "ประชุมตีสามไม่ได้",
  "ไฟดับตอนตีสี่",
  "ตื่นตีห้าไปโรงเรียน",
  "พ่อตีกอล์ฟวันอาทิตย์",
  "หนูไปตีแบดกับเพื่อน",
  "ช่วงเย็นไปตีเทนนิส",
  "ไปตีปิงปองที่ชมรม",
  "ครูตีกลองในคาบดนตรี",
  "หนูตีฉิ่งไม่เป็น",
  "แม่ให้ตีไข่ทำขนม",
  "ช่วยตีแปลงสีนี้ให้หน่อย",
  "เขาตีเส้นกับรุ่นพี่",
  "แม่ค้าตีตลาดแต่เช้า",
  "ข้อนี้ต้องตีโจทย์ใหม่",
  "วงนี้ตีวงกันมานาน",
  "ทั้งห้องตีซี้กัน",
  "อย่ามาตีฝีปากกับหนู",
  "นักแสดงตีบทได้น่ากลัว",
  "ร้านนี้ตีค่าสูง",
  "เขาตีมูลค่าหุ้นใหม่",
  "วัดตีระฆังเช้าทุกวัน",
  "วัดตีฆ้องก่อนสวด",
  "ทุกคนตบมือให้เพื่อน",
  "ช่วยตบยุงให้หน่อย",
  "แม่ตบแต่งบ้านใหม่",
  "หนูตบเท้าตามเพลง",
  "เพื่อนตบไหล่ให้กำลังใจ",
  "พี่ตบบ่าหนูแล้วยิ้ม",
  "เย็นนี้ไปต่อยมวย",
  "ไปเตะบอลหลังเลิกเรียน",
  "ไปเตะฟุตบอลที่สนาม",
  "ชมรมเตะตะกร้อเปิดรับสมัคร",
  "หมอนวดทุบหลังให้หนู",
  "ขอทุบไหล่หน่อยไหล่แข็ง",
  "ร้านนี้ทุบนวดแน่น",
  "ทีมนี้ทุบสถิติวิ่ง",
  "หนูทุบทิ้งของเก่าแล้ว",
  "ถีบจักรยานไปโรงเรียน",
  "ต้องผลักดันตัวเองให้สอบผ่าน",
  "ผลักให้ไปข้างหน้าอีกนิด",
  "เขาไปชกมวยที่ค่าย",
  "คำพูดนั้นทำร้ายจิตใจ",
  "อย่าทำร้ายความรู้สึกกัน",
  "เรื่องนี้ทำร้ายใจหนู",
  "หนูใช้กำลังใจทุกวัน",
];

const IN_SCOPE_INTENTS = new Set([
  "pregnancy", "emergency_contraception", "contraception", "sti_hiv",
  "relationship_consent", "mental_health", "other",
]);

function inScopeExamples(): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const c of [...BANK, ...BANK_FIXTURES]) {
    for (const [i, t] of visibleStrings(c).entries()) out.push({ id: `${c.id}/visible[${i}]`, text: t });
  }
  const items = (quiz as { items: { id: string; prompt_th: string; options?: string[] }[] }).items;
  for (const q of items) {
    out.push({ id: `${q.id}/prompt`, text: q.prompt_th });
    for (const [i, opt] of (q.options ?? []).entries()) out.push({ id: `${q.id}/opt[${i}]`, text: opt });
  }
  for (const it of seed.items as { id: string; kind: string; text: string; crisis?: boolean; intent?: string }[]) {
    if (it.crisis === true) continue;
    if (it.crisis === false || (it.kind === "helpfulness" && IN_SCOPE_INTENTS.has(it.intent ?? ""))) {
      out.push({ id: `seed:${it.id}`, text: it.text });
    }
  }
  return out;
}

const deps = (): TurnDeps => ({ cards: BANK, model: null, copyStatus: "draft" });
const FILLER = "อยากรู้เรื่องทั่วไปค่ะ"; // synthetic, no crisis words
async function talkReview(first: string) {
  let st = newDialog("15-17");
  const replies = [];
  for (const line of [first, FILLER]) {
    const o = await runTurn(st, line, deps());
    st = o.state;
    replies.push(o.reply);
  }
  return { st, replies };
}

describe("iteration-3 contextual crisis patterns (rules only)", () => {
  it("adds 10 contextual patterns: 5 violence_danger and 5 sexual_violence", () => {
    expect(EXTRA_CONTEXTUAL.violence_danger?.map((x) => x.id)).toEqual([
      "agent_hits", "victim_hit", "force_words", "threat", "harass_generic",
    ]);
    expect(EXTRA_CONTEXTUAL.sexual_violence?.map((x) => x.id)).toEqual([
      "harass_sexual", "victim_touch", "image_threat", "covert_photo", "nonpartner_touch",
    ]);
  });

  it.each(POSITIVES)("$id ($cat) fires on $text", ({ id, cat, text }) => {
    expect(squashHit(text, cat, id), `${id} must match ${text}`).toBe(true);
    expect(matchCrisisExtra(text).crisis, text).toBe(true);
    expect(matchCrisisExtra(text).categories, text).toContain(cat);
    const r = detectCrisisWithExtra(text);
    expect(r.crisis, text).toBe(true);
    expect(r.categories, text).toContain(cat);
    expect(crisisCallNowLine(r.categories), text).toBe(crisisCallNowLine([cat]));
  });

  it("extra pattern fires crisis before any model call", async () => {
    const model = {
      ready: () => true,
      pickCard: async () => { throw new Error("model must not run on a crisis turn"); },
      reword: async () => { throw new Error("model must not run on a crisis turn"); },
    };
    const out = await runTurn(newDialog("15-17"), "ผัวซ้อมหนูเมื่อคืน", { ...deps(), model });
    expect(out.reply.kind).toBe("crisis");
    if (out.reply.kind === "crisis") {
      expect(out.reply.categories[0]).toBe("violence_danger");
      expect(crisisCallNowLine(out.reply.categories)).toBe("โทร 1300 หรือ 191 ทันที");
    }
  });
});

describe("everyday unease stays off the crisis path", () => {
  it.each(SOFT)("%s is not a crisis", (text) => {
    expect(detectCrisisWithExtra(text).level, text).toBe("none");
    expect(matchCrisisExtra(text).level, text).toBe("none");
  });
});

describe("everyday lookalikes stay off the crisis path", () => {
  it.each(LOOKALIKES)("%s is not a crisis", (text) => {
    expect(detectCrisisWithExtra(text).level, text).toBe("none");
    expect(matchCrisisExtra(text).level, text).toBe("none");
  });
});

/** Synthetic review cases (Codex round 1). Everyday Thai that must not open the crisis screen. */
const REVIEW_NEGATIVES: string[] = [
  "แฟนไปซ้อมบอล",
  "แฟนพาไปปาร์ตี้",
  "แฟนชื่อตี๋",
  "โดนแมวข่วน",
  "แม่ค้าเตะมอไซค์ตอนเช้า",
  "เดินขึ้นภูเขาเตะหินเล่น",
  "จะปล่อยคลิปสอนแต่งหน้า",
  "โดนเพื่อนถ่ายคลิปตอนเต้น",
  "คลิปอนาจาร",
];

describe("review round: everyday Thai is not a crisis", () => {
  it.each(REVIEW_NEGATIVES)("%s is not a crisis", (text) => {
    expect(detectCrisisWithExtra(text).crisis, text).toBe(false);
    expect(detectCrisisWithExtra(text).level, text).toBe("none");
    expect(matchCrisisExtra(text).level, text).toBe("none");
  });

  it("ผัวไม่พอใจก็ซ้อมหนู still overrides as violence (ไม่ in ไม่พอใจ is not verb negation)", () => {
    const text = "ผัวไม่พอใจก็ซ้อมหนู";
    expect(squashHit(text, "violence_danger", "agent_hits")).toBe(true);
    expect(matchCrisisExtra(text).crisis).toBe(true);
    expect(matchCrisisExtra(text).categories).toContain("violence_danger");
    const r = detectCrisisWithExtra(text);
    expect(r.crisis).toBe(true);
    expect(r.categories).toContain("violence_danger");
    expect(crisisCallNowLine(r.categories)).toBe(crisisCallNowLine(["violence_danger"]));
  });

  it("a threat to leak a nude clip still overrides as sexual_violence", () => {
    const text = "ขู่จะปล่อยคลิปเปลือยหนู";
    expect(squashHit(text, "sexual_violence", "image_threat")).toBe(true);
    const r = detectCrisisWithExtra(text);
    expect(r.crisis).toBe(true);
    expect(r.categories).toContain("sexual_violence");
    expect(crisisCallNowLine(r.categories)).toBe(crisisCallNowLine(["sexual_violence"]));
  });

  it("merges base medical with extra sexual so 1669 is kept (base categories first)", () => {
    const text = "หายใจไม่ออกนิดหน่อย มีคนแอบถ่าย";
    const pinned = detectCrisis(text);
    const extra = matchCrisisExtra(text);
    expect(pinned.level).toBe("banner");
    expect(pinned.categories).toContain("medical_emergency");
    expect(extra.crisis).toBe(true);
    expect(extra.categories).toContain("sexual_violence");
    const comb = detectCrisisWithExtra(text);
    expect(comb.crisis).toBe(true);
    expect(comb.categories[0]).toBe("medical_emergency");
    expect(comb.categories).toEqual([...new Set([...pinned.categories, ...extra.categories])]);
    expect(comb.categories).toContain("sexual_violence");
    expect(crisisCallNowLine(comb.categories)).toContain("1669");
  });

  it("a negative case does not stick the crisis strip on a later card", async () => {
    for (const text of REVIEW_NEGATIVES) {
      const { st, replies } = await talkReview(text);
      expect(replies[0].kind, text).not.toBe("crisis");
      expect(st.crisisFired, text).toBe(false);
      expect(replies[1].kind, text).toBe("card");
      if (replies[1].kind === "card") expect(replies[1].banner, text).toEqual([]);
    }
  });
});

describe("in-scope bank / quiz / seed examples are not a crisis", () => {
  const rows = inScopeExamples();
  it(`walks ${rows.length} in-scope examples`, () => {
    expect(rows.length).toBeGreaterThan(20);
  });
  it.each(rows)("$id does not trigger crisis", ({ text }) => {
    expect(detectCrisisWithExtra(text).crisis, text).toBe(false);
  });
});

describe("mental-health card always offers 1323 tap-to-call", () => {
  it("every mental_health bank card has a tel:1323 button in the same format as the crisis card", () => {
    const mh = BANK.filter((c) => c.topic === "mental_health");
    expect(mh.length).toBeGreaterThan(0);
    for (const c of mh) {
      const call = c.links.find((l) => l.url === "tel:1323");
      expect(call, c.id).toEqual({ url: "tel:1323", label_th: "โทร 1323" });
    }
  });
});

describe("ไม่สบายใจ routes to mental health, not crisis", () => {
  it("alone and in a short everyday sentence", async () => {
    for (const text of ["ไม่สบายใจ", "วันนี้ไม่สบายใจเลย"]) {
      expect(detectCrisisWithExtra(text).level, text).toBe("none");
      expect(classifyNeed(text).intents[0], text).toBe("mental_health");
      const out = await runTurn(newDialog("15-17"), text, deps());
      expect(out.reply.kind, text).toBe("card");
      if (out.reply.kind === "card") {
        expect(out.reply.card.topic, text).toBe("mental_health");
        expect(out.reply.card.id, text).toBe("mental_health.p000");
        expect(out.reply.card.links.some((l) => l.url === "tel:1323"), text).toBe(true);
      }
    }
  });
});

const EXISTING_CRISIS: { id: string; text: string; cat: string }[] = [
  { id: "unit:self_harm_1", text: "ไม่อยากมีชีวิตอยู่แล้ว", cat: "self_harm" },
  { id: "unit:self_harm_2", text: "คิดจะฆ่าตัวตาย", cat: "self_harm" },
  { id: "unit:self_harm_spaced", text: "อยาก ตาย", cat: "self_harm" },
  { id: "unit:sexual_1", text: "หนูถูกข่มขืน", cat: "sexual_violence" },
  { id: "unit:sexual_2", text: "โดนบังคับมีเซ็กส์", cat: "sexual_violence" },
  { id: "unit:violence_1", text: "พ่อเลี้ยงทุบตีทุกวัน", cat: "violence_danger" },
  { id: "unit:violence_2", text: "แฟนขู่จะฆ่า", cat: "violence_danger" },
  { id: "unit:medical", text: "เลือดออกเยอะมาก หลังกินยา", cat: "medical_emergency" },
  { id: "unit:en", text: "I want to kill myself", cat: "self_harm" },
];

function fpCrisisItems(): { id: string; text: string; first: string }[] {
  const S = fpSet as { crisis: { id: string; text: string; first: string }[]; heldout_crisis: { id: string; text: string; first: string }[] };
  return [...S.crisis, ...S.heldout_crisis];
}

describe("existing crisis cases keep category and call-now line", () => {
  it.each(EXISTING_CRISIS)("$id still overrides as $cat", ({ text, cat }) => {
    const pinned = detectCrisis(text);
    const comb = detectCrisisWithExtra(text);
    expect(pinned.crisis, text).toBe(true);
    expect(comb.crisis, text).toBe(true);
    expect(comb.categories, text).toEqual(pinned.categories);
    expect(comb.categories, text).toContain(cat);
    expect(crisisCallNowLine(comb.categories), text).toBe(crisisCallNowLine(pinned.categories));
  });

  it.each(fpCrisisItems())("fixture $id keeps first-number order", ({ text, first }) => {
    const pinned = detectCrisis(text);
    const comb = detectCrisisWithExtra(text);
    expect(comb.crisis, text).toBe(true);
    expect(comb.categories, text).toEqual(pinned.categories);
    expect(crisisCallNowLine(comb.categories), text).toBe(crisisCallNowLine(pinned.categories));
    expect(crisisCallNowLine(comb.categories), text).toContain(first);
  });

  it("seed safety items keep category and call-now line", () => {
    const items = (seed.items as { id: string; text: string; crisis?: boolean; first?: string }[]).filter((x) => x.crisis);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      const pinned = detectCrisis(it.text);
      const comb = detectCrisisWithExtra(it.text);
      expect(comb.crisis, it.id).toBe(true);
      expect(comb.categories, it.id).toEqual(pinned.categories);
      expect(crisisCallNowLine(comb.categories), it.id).toBe(crisisCallNowLine(pinned.categories));
      if (it.first) expect(crisisCallNowLine(comb.categories), it.id).toContain(it.first);
    }
  });

  it("bank and fixture visible strings match the pinned detector", () => {
    const rows: { id: string; text: string }[] = [];
    for (const c of [...BANK, ...BANK_FIXTURES]) {
      for (const [i, t] of visibleStrings(c).entries()) rows.push({ id: `${c.id}/visible[${i}]`, text: t });
    }
    expect(rows.length).toBeGreaterThan(20);
    for (const { id, text } of rows) {
      const pinned = detectCrisis(text);
      const comb = detectCrisisWithExtra(text);
      expect(comb.crisis, id).toBe(pinned.crisis);
      expect(comb.categories, id).toEqual(pinned.categories);
      expect(crisisCallNowLine(comb.categories), id).toBe(crisisCallNowLine(pinned.categories));
    }
  });
});

const CLEARLY_SAFE = [
  "ประจำเดือนมาช้า กลัวท้อง",
  "อยากกินยาคุม",
  "ชักชวนเพื่อนไปตรวจเลือด",
  "แฟนกดดันให้มีเซ็กส์",
  "วันนี้อากาศดีมาก",
];

describe("clearly non-crisis messages stay off the crisis path", () => {
  it.each(CLEARLY_SAFE)("%s is not a crisis", (text) => {
    expect(detectCrisisWithExtra(text).crisis, text).toBe(false);
    expect(detectCrisisWithExtra(text).level, text).toBe("none");
  });
});

describe("crisis screen has zero img and zero svg", () => {
  it("crisisScreen in main.ts never builds img or svg", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/main.ts"), "utf8");
    const start = src.indexOf("function crisisScreen()");
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf("\nfunction ", start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);
    expect(body).toContain("screen-crisis");
    expect(body).not.toMatch(/["']img["']/);
    expect(body).not.toMatch(/["']svg["']/);
    expect(body).not.toMatch(/<img|<svg|\.svg|janeStar|janeImg|webp/i);
  });
});

