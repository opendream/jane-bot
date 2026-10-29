import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARM_ID_RE,
  MAX_ARM_BYTES,
  MAX_BLOB_BYTES,
  assessArm,
  parseArmParam,
  parseManifest,
  withArmModelPick,
  armSearch,
} from "../../src/dev/arms";
import {
  ARM_ID_RE as SCRIPT_ID_RE,
  MAX_ARM_BYTES as SCRIPT_MAX_ARM,
  MAX_BLOB_BYTES as SCRIPT_MAX_BLOB,
  parseShardName,
  writeManifest,
} from "../../scripts/devtest/make-arms.mjs";

describe("?arm= parsing", () => {
  it("missing means no arm (rules, nothing loads)", () => {
    expect(parseArmParam("")).toEqual({ kind: "none" });
    expect(parseArmParam("?modelPick=1")).toEqual({ kind: "none" });
  });
  it("off and unknown / malformed mean rules", () => {
    expect(parseArmParam("?arm=off")).toEqual({ kind: "off" });
    expect(parseArmParam("?arm=X-base")).toEqual({ kind: "off" });
    expect(parseArmParam("?arm=qwen3-1.7b")).toEqual({ kind: "off" });
    expect(parseArmParam("?arm=")).toEqual({ kind: "none" });
  });
  it("accepts A–F base and tuned", () => {
    for (const letter of "ABCDEF") {
      for (const kind of ["base", "tuned"] as const) {
        const id = `${letter}-${kind}`;
        expect(ARM_ID_RE.test(id), id).toBe(true);
        expect(parseArmParam(`?arm=${id}`)).toEqual({ kind: "id", id });
      }
    }
  });
});

describe("phone-ready checks", () => {
  const ok = {
    id: "A-base",
    label: "A-base",
    files: ["devtest/A-base.gguf"],
    bytes: 1.1e9,
    sha256: "a".repeat(64),
    blob_bytes: [1.1e9],
  };
  it("a well-formed arm under the caps is phone-ready", () => {
    expect(assessArm(ok)).toEqual({ phone_ready: true });
  });
  it("a Blob over 2 GiB without shards is not phone-ready", () => {
    const r = assessArm({ ...ok, bytes: MAX_BLOB_BYTES + 1, blob_bytes: [MAX_BLOB_BYTES + 1], files: ["devtest/A-base.gguf"] });
    expect(r.phone_ready).toBe(false);
    expect(r.not_ready_reason).toMatch(/split/i);
  });
  it("shards each ≤ 2 GiB with a total under 4 GiB can be ready", () => {
    const r = assessArm({
      ...ok,
      files: ["devtest/A-tuned-00001-of-00002.gguf", "devtest/A-tuned-00002-of-00002.gguf"],
      bytes: 3 * 1024 ** 3,
      blob_bytes: [1.5 * 1024 ** 3, 1.5 * 1024 ** 3],
    });
    expect(r.phone_ready).toBe(true);
  });
  it("a total over 4 GiB is never phone-ready", () => {
    const r = assessArm({ ...ok, bytes: MAX_ARM_BYTES + 1, blob_bytes: [MAX_ARM_BYTES + 1], files: ["a", "b"] });
    expect(r.phone_ready).toBe(false);
    expect(r.not_ready_reason).toMatch(/4 GiB/);
  });
  it("a sha mismatch / missing sha is not phone-ready", () => {
    expect(assessArm({ ...ok, sha256: "nope" }).phone_ready).toBe(false);
    expect(assessArm({ ...ok, sha256: "" }).phone_ready).toBe(false);
  });
  it("parseManifest greys unknown ids and applies the writer flag", () => {
    const m = parseManifest({
      arms: [
        { ...ok, phone_ready: true },
        { ...ok, id: "nope", phone_ready: true },
        { ...ok, id: "B-tuned", phone_ready: false, not_ready_reason: "needs split (a blob is over 2 GiB)" },
      ],
    });
    expect(m.arms.find((a) => a.id === "A-base")?.phone_ready).toBe(true);
    expect(m.arms.find((a) => a.id === "nope")?.phone_ready).toBe(false);
    expect(m.arms.find((a) => a.id === "B-tuned")?.phone_ready).toBe(false);
  });
});

describe("arm mode modelPick default", () => {
  it("adds modelPick=1 when an arm is set and the URL did not set it", () => {
    expect(withArmModelPick("?arm=A-tuned")).toContain("modelPick=1");
    expect(withArmModelPick("?arm=A-tuned")).toContain("arm=A-tuned");
  });
  it("keeps modelPick=0 so the legacy path can be tested", () => {
    expect(withArmModelPick("?arm=A-tuned&modelPick=0")).toContain("modelPick=0");
    expect(withArmModelPick("?arm=A-tuned&modelPick=0")).not.toContain("modelPick=1");
  });
  it("does not touch a URL with no arm", () => {
    expect(withArmModelPick("")).toBe("");
    expect(withArmModelPick("?model=off")).toBe("?model=off");
  });
  it("armSearch writes a one-URL switch", () => {
    expect(armSearch("", "B-base")).toContain("arm=B-base");
    expect(armSearch("?arm=A-base", "off")).toContain("arm=off");
  });
});

describe("make-arms.mjs", () => {
  it("keeps the same size caps as the client", () => {
    expect(SCRIPT_MAX_BLOB).toBe(MAX_BLOB_BYTES);
    expect(SCRIPT_MAX_ARM).toBe(MAX_ARM_BYTES);
    expect(String(SCRIPT_ID_RE)).toBe(String(ARM_ID_RE));
  });
  it("groups llama.cpp shards in order and hashes them", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jane-arms-"));
    const a = Buffer.from("synthetic-a-base-gguf");
    const s1 = Buffer.from("synthetic-shard-one");
    const s2 = Buffer.from("synthetic-shard-two");
    fs.writeFileSync(path.join(dir, "A-base.gguf"), a);
    fs.writeFileSync(path.join(dir, "B-tuned-00001-of-00002.gguf"), s1);
    fs.writeFileSync(path.join(dir, "B-tuned-00002-of-00002.gguf"), s2);
    fs.writeFileSync(path.join(dir, "C-base.gguf"), Buffer.from("synthetic-c"));
    const skip = parseShardName("readme.txt");
    expect(skip).toBeNull();
    const json = await writeManifest(dir, path.join(dir, "arms.json"));
    const byId = Object.fromEntries(json.arms.map((x: { id: string }) => [x.id, x]));
    expect(byId["A-base"].phone_ready).toBe(true);
    expect(byId["A-base"].sha256).toBe(createHash("sha256").update(a).digest("hex"));
    expect(byId["B-tuned"].files).toEqual([
      "devtest/B-tuned-00001-of-00002.gguf",
      "devtest/B-tuned-00002-of-00002.gguf",
    ]);
    expect(byId["C-base"].note).toMatch(/comparison only/);
    expect(fs.existsSync(path.join(dir, "arms.json"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
