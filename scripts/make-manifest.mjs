// Dev-only: builds scripts/weights-manifest.json (pinned URLs + sizes + sha256) from the original open sources.
// LFS files: sha256 from the Hugging Face API. Small files and WebGPU libs: downloaded once here and hashed.
import crypto from "node:crypto";
import fs from "node:fs";

const LIBS_COMMIT = "00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0"; // github.com/mlc-ai/binary-mlc-llm-libs (main, 22 Oct 2026)
const WEBLLM_VERSION_DIR = "v0_2_86/base";
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
async function get(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return Buffer.from(await r.arrayBuffer()); }
async function hf(repo) {
  const r = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`);
  return r.json();
}
async function mlcEntry(mid) {
  const repo = `mlc-ai/${mid}`;
  const d = await hf(repo);
  const files = [];
  for (const s of d.siblings) {
    if (s.rfilename === ".gitattributes" || s.rfilename === "README.md") continue;
    const url = `https://huggingface.co/${repo}/resolve/${d.sha}/${s.rfilename}`;
    const sha256 = s.lfs?.sha256 ?? sha(await get(url));
    files.push({ url, path: `webllm/${mid}/resolve/main/${s.rfilename}`, size: s.size, sha256 });
  }
  const lib = `${mid.replace(/-MLC$/, "")}_cs1k-webgpu.wasm`;
  const libUrl = `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${LIBS_COMMIT}/web-llm-models/${WEBLLM_VERSION_DIR}/${lib}`;
  const libBuf = await get(libUrl);
  files.push({ url: libUrl, path: `webllm/libs/${lib}`, size: libBuf.length, sha256: sha(libBuf) });
  return { source: `https://huggingface.co/${repo} @ ${d.sha}`, license: "Apache-2.0 (Qwen3 base; MLC build)", files };
}
async function ggufEntry(repo, file) {
  const d = await hf(repo);
  const s = d.siblings.find((x) => x.rfilename === file);
  return { source: `https://huggingface.co/${repo} @ ${d.sha}`, license: d.cardData?.license ?? "unknown",
    files: [{ url: `https://huggingface.co/${repo}/resolve/${d.sha}/${file}`, path: `gguf/${file}`, size: s.size, sha256: s.lfs.sha256 }] };
}
const manifest = {
  $comment: "Model weights for the demo. Fetched by scripts/fetch-weights.mjs from these pinned original sources and verified by sha256. Never committed or bundled.",
  generated: new Date().toISOString(),
  models: {
    "qwen3-1.7b": {
      webgpu_f16: await mlcEntry("Qwen3-1.7B-q4f16_1-MLC"),
      webgpu_f32: await mlcEntry("Qwen3-1.7B-q4f32_1-MLC"),
      wasm: await ggufEntry("unsloth/Qwen3-1.7B-GGUF", "Qwen3-1.7B-Q4_K_M.gguf"),
    },
    "qwen3-4b": {
      webgpu_f16: await mlcEntry("Qwen3-4B-q4f16_1-MLC"),
      webgpu_f32: await mlcEntry("Qwen3-4B-q4f32_1-MLC"),
      // No WASM build: the 2.5 GB GGUF exceeds wllama's 2 GB per-file limit; WASM falls back to qwen3-1.7b.
    },
  },
};
for (const m of Object.values(manifest.models)) for (const v of Object.values(m)) v.total_bytes = v.files.reduce((a, f) => a + f.size, 0);
fs.writeFileSync(new URL("./weights-manifest.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
console.log("ok");
