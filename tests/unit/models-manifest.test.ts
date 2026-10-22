import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { MODELS } from "../../src/llm/models";
import { MODEL } from "../../src/config";

const manifest = JSON.parse(fs.readFileSync("scripts/weights-manifest.json", "utf8"));

describe("model registry matches the weights manifest the fetch script uses", () => {
  it("default model is Qwen3 (Apache-2.0), not Typhoon", () => {
    expect(MODEL).toBe("qwen3-1.7b");
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain("typhoon");
  });
  for (const spec of Object.values(MODELS)) {
    it(`${spec.key}: every app path is in the manifest`, () => {
      const m = manifest.models[spec.key];
      expect(m, spec.key).toBeTruthy();
      const files = (v: string) => new Set<string>((m[v]?.files ?? []).map((f: any) => f.path));
      if (spec.wasm) expect(files("wasm").has(spec.wasm.file)).toBe(true);
      for (const v of ["webgpu_f16", "webgpu_f32"] as const) {
        const w = (spec as any)[v];
        if (!w) continue;
        const f = files(v);
        expect(f.has(w.lib), w.lib).toBe(true);
        expect([...f].some((p) => p.startsWith(`${w.dir}/resolve/main/`)), w.dir).toBe(true);
        expect([...f].some((p) => p.endsWith("mlc-chat-config.json"))).toBe(true);
      }
      for (const v of Object.values<any>(m)) for (const f of v.files) {
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(f.url).toMatch(/^https:\/\/(huggingface\.co|raw\.githubusercontent\.com)\//);
      }
    });
  }
});
