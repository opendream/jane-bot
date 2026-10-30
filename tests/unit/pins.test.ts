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

describe("pinned safety files stay byte-identical", () => {
  it("matches the grounded blob SHA-1 of each pinned file", () => {
    for (const [rel, sha] of Object.entries(PINNED)) {
      expect(gitBlobSha(rel), rel).toBe(sha);
    }
  });
});
