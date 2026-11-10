# Third-party components

This file records licences for software, fonts, models, and datasets that Jane
references or downloads. Model **weights are never in this git repository**.
Obtain them from the official sources below if you want the optional on-device
model. The app runs on rules without any weights.

This is not legal advice. Unclear or incompatible items are marked as such.

## In this repository

| Component | Licence | Notes |
| --- | --- | --- |
| Application code | Apache-2.0 | See `LICENSE`. SPDX in `package.json`. |
| Answer-bank text (`src/data/bank/`) | CC BY-SA 4.0 | Attribution: Opendream. Text only; not art. |
| Eval question set (`evals/` item files) | CC BY-SA 4.0 | Attribution: Opendream. Synthetic prompts. |
| Quiz content | CC BY-SA 4.0 | Adapted from Judies, Opendream 2017. Opendream owns Judies. |
| Jane illustrations (`src/assets/jane/`) | All rights reserved | © Opendream 2018. Some figures redrawn with AI assistance, 2026. **Not** Apache-2.0 or CC BY-SA. |
| Small mark (`src/assets/mark.svg`) | Apache-2.0 | Drawn in code for this build. |
| Mitr font | SIL OFL 1.1 | Cadson Demak. Self-hosted WOFF2. https://github.com/cadsondemak/mitr |

## Models the default branch may download

Weights are fetched by `node scripts/fetch-weights.mjs` from pinned revisions in
`scripts/weights-manifest.json`, then stored under gitignored `models/`.

| Component | Licence | Compatible with Apache-2.0 code? | Official source |
| --- | --- | --- | --- |
| Qwen3-0.6B | Apache-2.0 | Yes | https://huggingface.co/Qwen/Qwen3-0.6B |
| Qwen3-1.7B | Apache-2.0 | Yes | https://huggingface.co/Qwen/Qwen3-1.7B |
| Qwen3-4B (optional WebGPU) | Apache-2.0 | Yes | https://qwenlm.github.io/blog/qwen3/ |
| Qwen3-1.7B GGUF Q4_K_M (unsloth) | Apache-2.0 | Yes | https://huggingface.co/unsloth/Qwen3-1.7B-GGUF |
| Qwen3-1.7B / 4B MLC WebGPU builds | Unclear on the MLC card (no `license` field); base model is Apache-2.0 | Unclear for the conversion artifacts | https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC |
| WebLLM `@mlc-ai/web-llm` | Apache-2.0 | Yes | npm package / https://github.com/mlc-ai/web-llm |
| MLC WebGPU libraries (`binary-mlc-llm-libs`) | No licence declared on the GitHub repo (checked previously) | Unclear | https://github.com/mlc-ai/binary-mlc-llm-libs |
| wllama `@wllama/wllama` (llama.cpp WASM) | MIT | Yes | npm package |

## Referenced on other branches, not shipped on the default branch

| Component | Licence | Compatible? | Notes |
| --- | --- | --- | --- |
| Qwen3.5-0.8B | Apache-2.0 | Yes | https://huggingface.co/Qwen/Qwen3.5-0.8B — mentioned on `feat/devtest-arm-switcher` only. Not downloaded by default-branch scripts. |
| Qwen3.5-2B | Apache-2.0 | Yes | https://huggingface.co/Qwen/Qwen3.5-2B — same as above. |
| Gemma (comparison arms) | Gemma Terms of Use (not OSI) | **No** for shipping/redistributing weights in this project | https://ai.google.dev/gemma/terms — `feat/devtest-arm-switcher` documents private local comparison only. Nothing Gemma is committed or bundled. |
| multilingual-e5-small (matcher) | MIT | Yes | https://huggingface.co/intfloat/multilingual-e5-small — matcher is a no-op stub; weights are not fetched and not in git. |
| Typhoon / OpenTyphoon | Apache-2.0 **plus** extra terms | **Unclear / likely no** for an “open licence only” reading | https://opentyphoon.ai/tac — not used. Held until terms are cleared. |

## Datasets

Eval and unit-test prompts are synthetic. The answer bank is original Opendream
copy (plus Judies quiz, owned by Opendream). No third-party chat corpora are
vendored.
