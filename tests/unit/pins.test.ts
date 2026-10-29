import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

/** Git blob SHA-1 of a file (same as `git hash-object`). Fails if a pinned file changes by one byte. */
function gitBlobSha(file: string): string {
  const buf = fs.readFileSync(file);
  return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest("hex");
}

/** Grounded at e291714 (merge of #35). These six files stay byte-identical. */
const PINS: Record<string, string> = {
  "src/core/crisis.ts": "411f1531a32fe4b0353fc59975b2cdfec0a6c713",
  "src/core/guard.ts": "e452dc278b3f56a98b31c73b368b75821af9212e",
  "src/core/crisis-order.ts": "ffd4cdecbc97bcfe6704c290924ce6797d990e71",
  "scripts/bank/pii-patterns.mjs": "174de25dac4c1b933c4b5df74afb5d26d5ebba1a",
  "src/core/summary.ts": "ea53da49f5861a079b05c3d55592dee973a686b6",
  "tests/unit/pii-formats.test.ts": "9038609cc1234d699d16f2186d50480bf7341a91",
};

describe("pinned files stay byte-identical", () => {
  for (const [file, sha] of Object.entries(PINS)) {
    it(file, () => {
      expect(gitBlobSha(file), file).toBe(sha);
    });
  }
});
