# Model spike, 22 Oct 2026 (BKK), on Mr. Robot's box (8 CPU cores, 15 GB RAM, no GPU)

Everything below loaded weights from a local server on 127.0.0.1; Playwright recorded **only** the
`http://127.0.0.1:*` origin during each run (weights were downloaded once to the box beforehand with `spike/fetch-model.sh` / curl).

## 1. WebLLM 0.2.86 + Qwen3-1.7B (prebuilt MLC build), WebGPU on CPU (SwiftShader)

- Headless Chrome 155 exposes no WebGPU adapter by default. With `--enable-unsafe-webgpu` it exposes Google
  **SwiftShader** (CPU) WebGPU: no `shader-f16`, maxBuffer 1 GiB. So only the `q4f32_1` build can run; `q4f16_1` cannot.
- Ephemeral browser context: `QuotaExceededError` while caching ~0.9 GB weights in Cache Storage. A persistent profile fixed it
  (note for filming: use a normal, non-incognito Chrome profile).
- Result: **wiring works** (load 7.0 s from cache, "Finish loading on WebGPU - google"), but
  prefill 0.46 tok/s, decode 0.10 tok/s, first token after 203 s, and the **output was garbage** (mixed scripts), so
  SwiftShader is not a usable or trustworthy test path. Real WebGPU speed and quality need a GPU laptop.

## 2. wllama 3.8.1 (llama.cpp in WASM, CPU, 8 threads) + Qwen3-1.7B Q4_K_M GGUF (1.11 GB, unsloth build, Apache-2.0)

- Cross-origin isolated (COOP/COEP from `spike/serve.mjs`) → multi-threaded WASM, `n_gpu_layers: 0`.
- Load 8.1 s. JSON intent classification (system prompt + `/no_think`, max 24 tokens, temp 0):

| Input | Output | Time |
| --- | --- | --- |
| ประจำเดือนมาช้าไปสองอาทิตย์ กลัวท้อง | `{"intent":"emergency_contraception"}` ❌ (rules: pregnancy ✅) | 7.1 s |
| เมื่อคืนถุงยางแตก | `{"intent":"emergency_contraception"}` ✅ | 2.8 s |
| อยากไปตรวจเอชไอวี | `{"intent":"sti_hiv"}` ✅ | 2.1 s |

- Conclusion: a **CPU WASM path works in the browser today**, with no GPU, at a few seconds per short JSON answer. Qwen3-1.7B
  got 2/3 right, so the rules stay primary for routing; the model should only refine wording until it beats the rules on the seed set.
  wllama is a real fallback runtime for laptops without WebGPU (and works for the 2.5 GB Typhoon GGUF only if split into ≤512 MB chunks).

## 3. Typhoon 2.5 4B → MLC conversion (feasibility only, not attempted)

- `typhoon-ai/typhoon2.5-qwen3-4b` config is shape-identical to Qwen3-4B (36 layers, hidden 2560, 8 KV heads, vocab 151936,
  tied embeddings), matching WebLLM's prebuilt `Qwen3-4B-*` mlc-chat-config, so the prebuilt Qwen3-4B WebGPU lib should be reusable
  after `mlc_llm convert_weight` + `gen_config` (conv template `qwen3`).
- Cost: 8.06 GB safetensors download, plus an `mlc_llm` Python env (the box has Python 3.13; MLC wheels may need 3.11, likely via conda). Estimate 1–2 h if the wheel installs cleanly.
- A GPU laptop is still needed to measure speed and check output quality.

## 4. OpenTyphoon terms (read 22 Oct 2026)

- The model card and the GGUF README say **Apache-2.0**, *and* "By using this model, you agree to the OpenTyphoon Terms and Conditions" (https://opentyphoon.ai/tac).
- The T&C (written for the API, but clause 3 says it applies "regardless of the method of access", including open-source distribution) adds limits that Apache-2.0 does not have:
  - no using the Services **or Output** to train, fine-tune or improve any AI model **or dataset**;
  - no **competitive benchmarking**, data scraping or model extraction without written consent (a Typhoon-vs-Qwen scorecard could count as benchmarking);
  - no use as the sole basis for **healthcare** or other high-risk decisions (fine for us: we route to humans);
  - users under 15 need parent/guardian consent and supervision (matches our 15+ default);
  - the Company keeps all IP in the Models.
- An older version of the page (seen in a search snippet) also banned "modifying … or changing any function of the Services". It is not in the current text, but the terms can change without notice.
- **Flag:** this conflicts with an "open licence only" reading. Qwen3-1.7B / Qwen3-4B (plain Apache-2.0, no extra terms) avoid the problem. Keng's call.
