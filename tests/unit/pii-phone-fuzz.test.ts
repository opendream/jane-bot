import { describe, it, expect } from "vitest";
// @ts-ignore shared implementation
import { stripPII, findPII, toArabic } from "../../scripts/bank/pii-patterns.mjs";

const TOKEN = "[ลบข้อมูลส่วนตัว]";
const N = 20_000;

function toThaiDigits(s: string) {
  return s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0e50 + Number(d)));
}

/** Deterministic PRNG so the 20k set is stable. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function digits10(rand: () => number, mobile: boolean) {
  const lead = mobile ? (["06", "08", "09"] as const)[Math.floor(rand() * 3)] : "02";
  const n = mobile ? 8 : 7;
  let rest = "";
  for (let i = 0; i < n; i++) rest += String(Math.floor(rand() * 10));
  return lead + rest;
}

/** Shape families: compact / grouped / space-split leftover after an hour-range-looking part. */
function shape(d: string, kind: number): string {
  if (d.length === 9) {
    if (kind % 4 === 0) return d;
    if (kind % 4 === 1) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    if (kind % 4 === 2) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 5)}-${d.slice(5)}`;
  }
  // 10-digit mobile: compact / grouped / space-split leftovers after an hour-range-looking part
  switch (kind % 11) {
    case 0: return d;
    case 1: return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    case 2: return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    case 3: return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    case 4: return `${d[0]}${d[1]}.${d[2]}${d[3]}.${d[4]}${d[5]}.${d[6]}${d[7]}.${d[8]}${d[9]}`;
    case 5: return `${d[0]}${d[1]}.${d[2]}${d[3]}-${d[4]}${d[5]}.${d[6]}${d[7]} ${d[8]}${d[9]}`; // 08.12-23.45 67
    case 6: return `${d[0]}${d[1]}.${d[2]}${d[3]} - ${d[4]}${d[5]}.${d[6]}${d[7]} ${d[8]}${d[9]}`;
    case 7: return `${d[0]}${d[1]}.${d[2]}${d[3]}–${d[4]}${d[5]}.${d[6]}${d[7]} ${d[8]}${d[9]}`; // en dash
    case 8: return `${d.slice(0, 3)} ${d[3]}.${d[4]}${d[5]}-${d[6]}${d[7]}.${d[8]}${d[9]}`; // 081 2.30-13.45
    case 9: return `${d.slice(0, 2)} ${d[2]}${d[3]}.${d[4]}${d[5]}-${d[6]}${d[7]}.${d[8]}${d[9]}`; // 08 12.30-13.45
    default: return `${d[0]} ${d[1]}.${d[2]}${d[3]}-${d[4]}${d[5]}.${d[6]}${d[7]} ${d[8]}${d[9]}`; // 0 8.12-23.45 67
  }
}

describe("20k synthetic phone fuzz (incl. space-split / en dash / Thai digits)", () => {
  it("redacts every generated number (0 leaks)", () => {
    const rand = mulberry32(20261024);
    let leaks = 0;
    let spaceSplit = 0;
    let spaceSplitLeaks = 0;
    const samples: string[] = [];
    for (let i = 0; i < N; i++) {
      const mobile = i % 5 !== 0;
      const d = digits10(rand, mobile);
      let shown = shape(d, i);
      const isSpaceSplit = mobile && (i % 11) >= 5;
      if (isSpaceSplit) spaceSplit++;
      if (i % 3 === 0) shown = toThaiDigits(shown);
      const text = `โทร ${shown} นะ`;
      const out = stripPII(text);
      const digitsLeft = toArabic(out).replace(/\D/g, "");
      const hit = findPII(text);
      if (out.includes(shown) || !out.includes(TOKEN) || digitsLeft.includes(d) || !hit.phone?.length) {
        leaks++;
        if (isSpaceSplit) spaceSplitLeaks++;
        if (samples.length < 8) samples.push(shown);
      }
    }
    expect(spaceSplit, "space-split samples generated").toBeGreaterThan(5000);
    expect(samples, `${leaks} leaks (${spaceSplitLeaks} space-split)`).toEqual([]);
    expect(leaks).toBe(0);
    expect(spaceSplitLeaks).toBe(0);
  });
});
