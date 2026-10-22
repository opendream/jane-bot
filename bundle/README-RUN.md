# Run bundle: SRH referral demo (placeholder name)

Private prototype for filming. Apache-2.0 (see `LICENSE`). Synthetic data only. **Thai copy is DRAFT.**
The app runs entirely in the browser; the local server only hands out static files and never sees chat text.

## Needs

- macOS (or Linux) with **Node.js 18+**. Nothing else: no npm install, no GPU required.
- **Google Chrome** (WebGPU on Apple Silicon). About **5 GB free disk**: ~2.1 GB weights on disk + the same again in Chrome's cache.
- Internet **only for the first run** (weights come from Hugging Face / GitHub at pinned revisions, each file sha256-checked).

## Start

```bash
cd srh-demo-run-bundle
./start.sh                  # or double-click start.command (first time: right-click → Open)
```

It (1) checks the app files against `SHA256SUMS`, (2) downloads the model weights into `models/` once
(re-running skips files that are already valid and resumes failed ones), (3) serves on **http://127.0.0.1:4173**
(127.0.0.1 only, never on the network) and opens Chrome.

Options: `./start.sh --no-fetch` (serve only), `./start.sh --model qwen3-4b` (bigger model, WebGPU only, +2.3 GB;
opens `/?model=qwen3-4b`), `PORT=5000 ./start.sh`.

## Which model runs

The small pill under the header says what is running:

| Pill | Meaning |
| --- | --- |
| 🔒 โมเดลในเครื่อง: Qwen3-1.7B · ออฟไลน์ | model ready, on device |
| ⏳ กำลังโหลดโมเดล … % | loading; the app already works on rules meanwhile |
| 🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์ | rules only (no weights, or model failed) |

Order tried: WebGPU (real GPU) → WASM (CPU) → rules. Crisis detection is always rules-only, before any model.
URL switches for testing: `?runtime=wasm`, `?runtime=webgpu`, `?model=off`, `?model=qwen3-4b`.

## Sizes

| Build | Size | Source (pinned) |
| --- | --- | --- |
| Qwen3-1.7B WebGPU q4f16 (default on GPU) | 0.99 GB | huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC |
| Qwen3-1.7B WASM GGUF Q4_K_M (CPU fallback) | 1.11 GB | huggingface.co/unsloth/Qwen3-1.7B-GGUF |
| Qwen3-4B WebGPU q4f16 (optional) | 2.29 GB | huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC |

Qwen3 weights: Apache-2.0 (Qwen). Runtime notices: `THIRD-PARTY-NOTICES.md`.

## Reset

Stop the server (Ctrl+C). To drop Chrome's model cache: Chrome → Settings → Privacy → Site data → `127.0.0.1` → delete.
To drop the downloaded weights: delete `models/`.
