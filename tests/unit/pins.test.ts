import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Byte-identical pins for safety files this PR must not touch.
 * Git blob SHA-1 = sha1("blob " + length + "\\0" + bytes), same as `git hash-object`.
 * Grounded at e291714 (merge of #35), the default-branch tip this PR branched from.
 */
function gitBlobSha(rel: string): string {
  const bytes = readFileSync(rel);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

const PINNED = {
  "src/core/crisis.ts": "411f1531a32fe4b0353fc59975b2cdfec0a6c713",
  "src/core/guard.ts": "19fff7350b90616b1b1d908a91f4c664bfb369bc",
  "src/core/crisis-order.ts": "ffd4cdecbc97bcfe6704c290924ce6797d990e71",
  "scripts/bank/pii-patterns.mjs": "174de25dac4c1b933c4b5df74afb5d26d5ebba1a",
  "src/core/summary.ts": "ea53da49f5861a079b05c3d55592dee973a686b6",
  "tests/unit/pii-formats.test.ts": "9038609cc1234d699d16f2186d50480bf7341a91",
} as const;

/** Keng, 30 Oct 2026 10:18 BKK: this voice PR may unpin guard.ts for these 6 literals only. */
export const GUARD_VOICE_STRINGS: readonly { old: string; neu: string }[] = [
  { old: "เรื่องนี้พี่ช่วยไม่ได้", neu: "เรื่องนี้เราช่วยไม่ได้ค่ะ" },
  { old: "พี่คุยแบบสวมบทบาทไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามพี่ได้เลย", neu: "เราคุยแบบสวมบทบาทไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือความสัมพันธ์ ถามเราได้เลยค่ะ" },
  { old: "พี่คุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามพี่ได้เลย", neu: "เราคุยเรื่องทางเพศแบบโจ่งแจ้งไม่ได้นะคะ แต่ถ้ามีคำถามเรื่องสุขภาพหรือการป้องกัน ถามเราได้เลยค่ะ" },
  { old: "พี่รับหรือส่งรูปไม่ได้ และไม่ต้องส่งรูปใด ๆ มานะ เล่าเป็นข้อความได้เลย", neu: "เรารับหรือส่งรูปไม่ได้นะคะ เล่าเป็นข้อความได้เลยค่ะ" },
  { old: "เรื่องขนาดยาหรือวิธีกินยา พี่บอกไม่ได้ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรง", neu: "เราให้คำปรึกษาเรื่องขนาดยาหรือวิธีกินยาไม่ได้ค่ะ ควรถามเภสัชกรหรือเจ้าหน้าที่โดยตรงค่ะ" },
  { old: "พี่ให้ข้อมูลวิธีทำแท้งไม่ได้ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับ", neu: "เราให้ข้อมูลวิธีทำแท้งไม่ได้ค่ะ แต่มีเจ้าหน้าที่ที่ปรึกษาเรื่องท้องไม่พร้อมได้อย่างปลอดภัยและเป็นความลับนะคะ" },
];

const GUARD_BASE_BLOB = "e452dc278b3f56a98b31c73b368b75821af9212e";

function blobShaOf(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

describe("pinned safety files stay byte-identical", () => {
  it("matches the grounded blob SHA-1 of each pinned file", () => {
    for (const [rel, sha] of Object.entries(PINNED)) {
      expect(gitBlobSha(rel), rel).toBe(sha);
    }
  });

  it("guard.ts differs from e452dc27 only in the 6 refusal string literals", () => {
    expect(GUARD_VOICE_STRINGS).toHaveLength(6);
    const current = readFileSync("src/core/guard.ts");
    expect(blobShaOf(current)).toBe(PINNED["src/core/guard.ts"]);
    let normalized = current.toString("utf8");
    const pairs = [...GUARD_VOICE_STRINGS].sort((a, b) => b.neu.length - a.neu.length);
    for (const { old, neu } of pairs) {
      expect(normalized, neu).toContain(neu);
      const n = normalized.split(neu).length - 1;
      expect(n, neu).toBeGreaterThanOrEqual(1);
      normalized = normalized.split(neu).join(old);
    }
    for (const { neu } of GUARD_VOICE_STRINGS) {
      expect(normalized).not.toContain(neu);
    }
    expect(blobShaOf(Buffer.from(normalized, "utf8"))).toBe(GUARD_BASE_BLOB);
  });
});
