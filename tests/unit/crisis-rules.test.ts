import { describe, it, expect } from "vitest";
import { detectCrisis, EXTRA_CONTEXTUAL } from "../../src/core/crisis";
import type { CrisisCategory } from "../../src/core/types";
import { classifyNeed } from "../../src/core/intent";
import { compact } from "../../src/core/text";
import { visibleStrings } from "../../src/core/bank";
import { BANK, BANK_FIXTURES } from "../../src/core/bankData";
import { runTurn, newDialog, type TurnDeps } from "../../src/core/dialog";
import seed from "../../evals/seed-set.json";
import quiz from "../../src/data/bank/quiz.json";

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
    const r = detectCrisis(text);
    expect(r.crisis, text).toBe(true);
    expect(r.categories, text).toContain(cat);
  });
});

describe("everyday unease stays off the crisis path", () => {
  it.each(SOFT)("%s is not a crisis", (text) => {
    expect(detectCrisis(text).level, text).toBe("none");
  });
});

describe("everyday lookalikes stay off the crisis path", () => {
  it.each(LOOKALIKES)("%s is not a crisis", (text) => {
    expect(detectCrisis(text).level, text).toBe("none");
  });
});

describe("in-scope bank / quiz / seed examples are not a crisis", () => {
  const rows = inScopeExamples();
  it(`walks ${rows.length} in-scope examples`, () => {
    expect(rows.length).toBeGreaterThan(20);
  });
  it.each(rows)("$id does not trigger crisis", ({ text }) => {
    expect(detectCrisis(text).crisis, text).toBe(false);
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
      expect(detectCrisis(text).level, text).toBe("none");
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
