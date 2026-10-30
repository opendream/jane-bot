import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { MODELS } from "../../src/llm/models";
import { MODEL } from "../../src/config";

const manifest = JSON.parse(fs.readFileSync("scripts/weights-manifest.json", "utf8"));

describe("model registry matches the weights manifest the fetch script uses", () => {
  it("default model is the fine-tuned Qwen3-0.6B (Apache-2.0), not Typhoon", () => {
    expect(MODEL).toBe("qwen3-0.6b-ft");
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain("typhoon");
  });
  it("qwen3-0.6b-ft is wasm-only, local, pinned, and has no URL", () => {
    const spec = MODELS["qwen3-0.6b-ft"];
    expect(spec.webgpu_f16).toBeUndefined();
    expect(spec.webgpu_f32).toBeUndefined();
    expect(spec.wasm).toEqual({ file: "gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf", bytes: 484220256 });
    const wasm = manifest.models["qwen3-0.6b-ft"].wasm;
    expect(wasm.source).toBe("local");
    expect(wasm.files).toHaveLength(1);
    const f = wasm.files[0];
    expect(f.path).toBe("gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf");
    expect(f.size).toBe(484220256);
    expect(f.sha256).toBe("1a8056e4f1d0afba32ab87c24f8c2740258b130a9bb7bb5311e742c921daf8e2");
    expect(f.url).toBeUndefined();
    expect(JSON.stringify(wasm)).not.toMatch(/https?:\/\//);
  });
  for (const spec of Object.values(MODELS)) {
    it(`${spec.key}: every app path is in the manifest`, () => {
      const m = manifest.models[spec.key];
      expect(m, spec.key).toBeTruthy();
      const files = (v: string) => new Set<string>((m[v]?.files ?? []).map((f: any) => f.path));
      if (spec.wasm) expect(files("wasm").has(spec.wasm.file)).toBe(true);
      for (const v of ["webgpu_f16", "webgpu_f32"] as const) {
        const w = spec[v];
        if (!w) continue;
        const f = files(v);
        expect(f.has(w.lib), w.lib).toBe(true);
        expect([...f].some((p) => p.startsWith(`${w.dir}/resolve/main/`)), w.dir).toBe(true);
        expect([...f].some((p) => p.endsWith("mlc-chat-config.json"))).toBe(true);
      }
      for (const v of Object.values<any>(m)) for (const f of v.files) {
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
        if (f.url) {
          expect(f.url).toMatch(/^https:\/\/(huggingface\.co|raw\.githubusercontent\.com)\//);
        } else {
          expect(v.source).toBe("local");
        }
      }
    });
  }
});
