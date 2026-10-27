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
  { id: "partner_hits_me", cat: "violence_danger", text: "ผัวซ้อมหนูเมื่อคืน" },
  { id: "victim_hit", cat: "violence_danger", text: "โดนซ้อมจนตัวเขียว" },
  { id: "image_threat", cat: "sexual_violence", text: "เขาขู่จะปล่อยคลิปหนู" },
  { id: "coerce_nudes", cat: "sexual_violence", text: "บังคับให้ส่งรูปโป๊" },
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
  it("adds 4 high-precision extra shapes: 2 violence_danger and 2 sexual_violence", () => {
    expect(EXTRA_CONTEXTUAL.violence_danger?.map((x) => x.id)).toEqual([
      "victim_hit", "partner_hits_me",
    ]);
    expect(EXTRA_CONTEXTUAL.sexual_violence?.map((x) => x.id)).toEqual([
      "image_threat", "coerce_nudes",
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

/**
 * Cumulative extra-pattern corpus. Synthetic Thai only. CI gate: `npm test`.
 * Original 10 true cases + Codex rounds 1–3. Extra matcher keeps only the
 * four high-precision shapes in crisis-extra.ts. Rows with extra: false stay
 * in the table (kept from earlier rounds) but are left to pinned detectCrisis
 * — extra must not widen to catch them.
 */
type CorpusFire = { id: string; text: string; crisis: true; cat: CrisisCategory; extra?: true };
type CorpusBaseOnly = { id: string; text: string; crisis: true; cat: CrisisCategory; extra: false };
type CorpusNeg = { id: string; text: string; crisis: false };
type CorpusRow = CorpusFire | CorpusBaseOnly | CorpusNeg;

const CORPUS: CorpusRow[] = [
  // Original 10 extra-pattern true cases
  { id: "orig/agent_hits", text: "ผัวซ้อมหนูเมื่อคืน", crisis: true, cat: "violence_danger" },
  { id: "orig/victim_hit", text: "โดนซ้อมจนตัวเขียว", crisis: true, cat: "violence_danger" },
  // base detector only — dropped force_words shape
  { id: "orig/force_words", text: "บ้านนี้มีความรุนแรงในครอบครัว", crisis: true, cat: "violence_danger", extra: false },
  // base detector only — dropped generic threat shape
  { id: "orig/threat", text: "เขาข่มขู่หนูทุกวัน", crisis: true, cat: "violence_danger", extra: false },
  // base detector only — dropped harass_generic shape
  { id: "orig/harass_generic", text: "มีคนสะกดรอยตามจากโรงเรียน", crisis: true, cat: "violence_danger", extra: false },
  // base detector only — dropped harass_sexual shape
  { id: "orig/harass_sexual", text: "เพื่อนร่วมงานแทะโลมหนู", crisis: true, cat: "sexual_violence", extra: false },
  // base detector only — dropped victim_touch shape
  { id: "orig/victim_touch", text: "โดนจับหน้าอกบนรถเมล์", crisis: true, cat: "sexual_violence", extra: false },
  { id: "orig/image_threat", text: "เขาขู่จะปล่อยคลิปหนู", crisis: true, cat: "sexual_violence" },
  // base detector only — dropped covert_photo shape
  { id: "orig/covert_photo", text: "มีคนแอบถ่ายในห้องน้ำ", crisis: true, cat: "sexual_violence", extra: false },
  // base detector only — dropped nonpartner_touch shape
  { id: "orig/nonpartner_touch", text: "ลุงจับก้นหนู", crisis: true, cat: "sexual_violence", extra: false },

  // Round 1 — still extra-fire
  { id: "r1/zom_not_negation", text: "ผัวไม่พอใจก็ซ้อมหนู", crisis: true, cat: "violence_danger" },
  { id: "r1/nude_clip_threat", text: "ขู่จะปล่อยคลิปเปลือยหนู", crisis: true, cat: "sexual_violence" },
  { id: "r1/conditional_nude_clip", text: "จะปล่อยคลิปโป๊ถ้าหนูไม่ยอม", crisis: true, cat: "sexual_violence" },
  { id: "r1/ex_clip_threat", text: "แฟนเก่าขู่ปล่อยคลิป", crisis: true, cat: "sexual_violence" },
  // base detector only — ซ้อม+me with no named agent (not shapes c/d)
  { id: "r1/beat_me_zom", text: "ซ้อมหนู", crisis: true, cat: "violence_danger", extra: false },
  { id: "r1/beat_me_chan", text: "ซ้อมฉัน", crisis: true, cat: "violence_danger", extra: false },
  { id: "r1/obscene_clip_me", text: "หนูโดนคลิปอนาจาร", crisis: true, cat: "sexual_violence", extra: false },

  // Round 1 — everyday Thai, not a crisis
  { id: "r1/practice_ball", text: "แฟนไปซ้อมบอล", crisis: false },
  { id: "r1/party", text: "แฟนพาไปปาร์ตี้", crisis: false },
  { id: "r1/nickname_tee", text: "แฟนชื่อตี๋", crisis: false },
  { id: "r1/cat_scratch", text: "โดนแมวข่วน", crisis: false },
  { id: "r1/vendor_kick", text: "แม่ค้าเตะมอไซค์ตอนเช้า", crisis: false },
  { id: "r1/mountain_kick", text: "เดินขึ้นภูเขาเตะหินเล่น", crisis: false },
  { id: "r1/makeup_clip", text: "จะปล่อยคลิปสอนแต่งหน้า", crisis: false },
  { id: "r1/dance_clip", text: "โดนเพื่อนถ่ายคลิปตอนเต้น", crisis: false },
  { id: "r1/bare_obscene_clip", text: "คลิปอนาจาร", crisis: false },
  { id: "r1/recipe_practice", text: "แม่ค้าซ้อมสูตรขนม", crisis: false },
  { id: "r1/bare_ball_practice", text: "ซ้อมบอล", crisis: false },

  // Round 2 — image/clip only with threat, coercion, or sexual content
  { id: "r2/fortune_photo", text: "จะส่งรูปให้หมอดูถ้าไม่หาย", crisis: false },
  { id: "r2/travel_photo", text: "ถ้าว่างจะลงรูปเที่ยว", crisis: false },
  { id: "r2/facebook_photo", text: "แฟนเอารูปไปลงเฟส", crisis: false },
  { id: "r2/sex_clip", text: "แฟนถ่ายคลิปตอนมีอะไรกัน", crisis: true, cat: "sexual_violence" },

  // Round 2 — ตี word boundaries
  { id: "r2/distance_idiom", text: "แฟนตีตัวออกห่าง", crisis: false },
  { id: "r2/foot", text: "ตีน", crisis: false },
  { id: "r2/retort", text: "ตีกลับ", crisis: false },
  { id: "r2/partner_retort", text: "แฟนตีกลับ", crisis: false },
  { id: "r2/sore_foot", text: "แฟนเจ็บตีน", crisis: false },
  { id: "r2/partner_hits_me", text: "แฟนตีหนู", crisis: true, cat: "violence_danger" },
  // base detector only — hitting น้อง is not hitting 'me'
  { id: "r2/hits_sibling", text: "แฟนตีน้อง", crisis: true, cat: "violence_danger", extra: false },
  { id: "r2/hit_by_dad", text: "โดนพ่อตี", crisis: true, cat: "violence_danger" },
  { id: "r2/blackmail_photo", text: "โดนแบล็กเมล์ด้วยรูป", crisis: true, cat: "sexual_violence" },

  // Round 2 — person+ซ้อม with no victim is a dropped bare verb; sport/negation stay no-fire
  // base detector only — person + ซ้อม with no 'me'
  { id: "r2/husband_beats", text: "ผัวซ้อม", crisis: true, cat: "violence_danger", extra: false },
  { id: "r2/drunk_beats", text: "ผัวเมาแล้วซ้อม", crisis: true, cat: "violence_danger", extra: false },
  { id: "r2/dad_beats_mom", text: "พ่อซ้อมแม่", crisis: true, cat: "violence_danger", extra: false },
  { id: "r2/pre_match_drill", text: "ถูกซ้อมหนักก่อนแข่ง", crisis: false },
  { id: "r2/never_beats", text: "แฟนไม่เคยซ้อมหนู", crisis: false },
  { id: "r2/music_practice", text: "ซ้อมดนตรี", crisis: false },

  // Round 2 — persistence is not violence; ข่วน is a dropped bare verb
  { id: "r2/persistent", text: "ผู้ชายตามตื๊อ", crisis: false },
  // base detector only — ข่วน is not ซ้อม/ตี
  { id: "r2/partner_scratch_bleed", text: "แฟนข่วนจนเลือดออก", crisis: true, cat: "violence_danger", extra: false },
  { id: "r2/husband_scratch", text: "โดนผัวข่วน", crisis: true, cat: "violence_danger", extra: false },

  // Round 3 — extra-fire (passive ซ้อม/ตี, leak with any ถ้า, coerce nudes, friend beating me)
  { id: "r3/passive_beat", text: "โดนซ้อม", crisis: true, cat: "violence_danger" },
  { id: "r3/passive_beat_daily", text: "ถูกซ้อมทุกวัน", crisis: true, cat: "violence_danger" },
  { id: "r3/ganged_beat", text: "โดนรุมซ้อม", crisis: true, cat: "violence_danger" },
  { id: "r3/friend_beats_me", text: "เพื่อนซ้อมหนู", crisis: true, cat: "violence_danger" },
  { id: "r3/breakup_leak", text: "ถ้าเลิกกันจะปล่อยคลิป", crisis: true, cat: "sexual_violence" },
  { id: "r3/breakup_leak_me", text: "ถ้าเลิกกันจะปล่อยคลิปหนู", crisis: true, cat: "sexual_violence" },
  { id: "r3/force_nudes", text: "บังคับให้ส่งรูปโป๊", crisis: true, cat: "sexual_violence" },

  // Round 3 — practice / instrument / sport / idiom no-fire (plus repeats already above)
  { id: "r3/practice_run", text: "แฟนไปซ้อมวิ่ง", crisis: false },
  { id: "r3/practice_guitar", text: "แฟนซ้อมกีตาร์", crisis: false },
  { id: "r3/practice_dance", text: "แม่ไปซ้อมรำ", crisis: false },
  { id: "r3/practice_speech", text: "ครูให้ซ้อมพูด", crisis: false },
  { id: "r3/ranat", text: "ตีระนาด", crisis: false },
  { id: "r3/spread_idiom", text: "ตีแผ่", crisis: false },
  { id: "r3/futsal", text: "เตะฟุตซอล", crisis: false },
  { id: "r3/cat_scratched_partner", text: "แฟนโดนแมวข่วน", crisis: false },

  // More practice, instrument, and sport verbs (round 3 extras)
  { id: "r3/practice_swim", text: "แฟนไปซ้อมว่ายน้ำ", crisis: false },
  { id: "r3/practice_piano", text: "แฟนซ้อมเปียโน", crisis: false },
  { id: "r3/practice_yoga", text: "ไปซ้อมโยคะ", crisis: false },
  { id: "r3/practice_basketball", text: "ซ้อมบาสที่สนาม", crisis: false },
  { id: "r3/practice_volleyball", text: "ซ้อมวอลเลย์", crisis: false },
  { id: "r3/practice_driving", text: "แม่ไปซ้อมขับ", crisis: false },
  { id: "r3/practice_badminton", text: "แฟนไปซ้อมแบดมินตัน", crisis: false },
  { id: "r3/practice_reading", text: "ครูให้ซ้อมอ่าน", crisis: false },
  { id: "r3/khim", text: "ตีขิม", crisis: false },
  { id: "r3/angklung", text: "ตีอังกะลุง", crisis: false },
  { id: "r3/cheer", text: "ซ้อมเชียร์ลีดเดอร์", crisis: false },
];

const CORPUS_POS = CORPUS.filter((r): r is CorpusFire => r.crisis && r.extra !== false);
const CORPUS_BASE = CORPUS.filter((r): r is CorpusBaseOnly => r.crisis && r.extra === false);
const CORPUS_NEG = CORPUS.filter((r): r is CorpusNeg => !r.crisis);

describe("crisis extra corpus (original + review rounds 1–3, CI gate)", () => {
  it(`splits ${CORPUS.length} cases into ${CORPUS_POS.length} extra-fire, ${CORPUS_BASE.length} base-detector-only, and ${CORPUS_NEG.length} no-fire`, () => {
    expect(CORPUS_POS).toHaveLength(18);
    expect(CORPUS_BASE).toHaveLength(16);
    expect(CORPUS_NEG).toHaveLength(42);
    expect(CORPUS).toHaveLength(76);
  });

  it.each(CORPUS)("$id ($text)", (row) => {
    const extra = matchCrisisExtra(row.text);
    const comb = detectCrisisWithExtra(row.text);
    const pinned = detectCrisis(row.text);
    if (row.crisis && row.extra !== false) {
      expect(extra.crisis, row.text).toBe(true);
      expect(extra.categories, row.text).toContain(row.cat);
      expect(comb.crisis, row.text).toBe(true);
      expect(comb.categories, row.text).toContain(row.cat);
      expect(crisisCallNowLine(comb.categories), row.text).toBe(crisisCallNowLine([row.cat]));
    } else if (row.crisis && row.extra === false) {
      // base detector only: extra must not widen; combined follows pinned detectCrisis
      expect(extra.crisis, row.text).toBe(false);
      expect(comb.crisis, row.text).toBe(pinned.crisis);
      expect(comb.categories, row.text).toEqual(pinned.categories);
    } else {
      expect(comb.crisis, row.text).toBe(false);
      expect(comb.level, row.text).toBe("none");
      expect(extra.level, row.text).toBe("none");
    }
  });
});

describe("review round: keep-passing extras around the corpus", () => {
  it("ผัวไม่พอใจก็ซ้อมหนู still matches partner_hits_me (ไม่ in ไม่พอใจ is not verb negation)", () => {
    const text = "ผัวไม่พอใจก็ซ้อมหนู";
    expect(squashHit(text, "violence_danger", "partner_hits_me")).toBe(true);
  });

  it("a threat to leak a nude clip still matches image_threat", () => {
    expect(squashHit("ขู่จะปล่อยคลิปเปลือยหนู", "sexual_violence", "image_threat")).toBe(true);
  });

  // Codex round-1 extra-negation probes. Pinned detectCrisis still matches ตีหนู.
  it("extra does not fire on แฟนไม่เคยตีหนู / แฟนไม่ตีหนู (pinned ตีหนู still matches detectCrisis)", () => {
    for (const text of ["แฟนไม่เคยตีหนู", "แฟนไม่ตีหนู"]) {
      expect(matchCrisisExtra(text).crisis, text).toBe(false);
      expect(detectCrisis(text).crisis, text).toBe(true);
    }
  });

  it("merges base medical with extra sexual so 1669 is kept (base categories first)", () => {
    const text = "หายใจไม่ออกนิดหน่อย เขาขู่จะปล่อยคลิปหนู";
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
    for (const { text } of CORPUS_NEG) {
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

