# Jane (เจน)

Thai sexual-health information chat demo by [Opendream](https://opendream.co.th/).

Jane helps a person describe a need in Thai, checks for crisis language first, then suggests public services and a handoff summary. It is a **local demo**, not a clinic, not a counsellor, and **not medical advice**.

If the text looks like a crisis (self-harm, violence, emergency), Jane stops the normal flow and shows Thailand support lines with tap-to-call (`tel:`): **1323**, **1300**, **1669**, and **191**. Mixed or unclear crisis wording shows all four.

Minimum age for the demo is 15 (`MIN_AGE` in `src/config.ts`). Name: **เจน** (Thai) / **Jane** (English), `PRODUCT_NAME` / `PRODUCT_NAME_EN` in `src/config.ts`.

## Demo

The shipped default is **card-first**: Jane maps the turn to an approved answer-bank card. **Chat-first is experimental and off** (`CHAT_FIRST = false` in `src/config.ts`). Crisis wording always bypasses the model, on both paths.

The default model (`qwen3-0.6b-ft`, v40) is a JSON card-choice fine-tune (`{o,c,q}`), not a prose chat model. Chat-first needs a prose-trained model.

Opt in with the URL param (works on the production build and `npm run dev`):

- `?chatFirst=1` (also `on` or `true`) — experimental chat-first
- `?chatFirst=0` (also `off` or `false`) forces card-first

Example: `http://127.0.0.1:5173/?chatFirst=1`

When chat-first is on:

- Jane chats first; the model writes the visible line and reviewed bank cards are fallback-only. The person can tap **ขอข้อมูลเลย** to see the card immediately.
- **CLEAR** crisis words bypass the model and go straight to the existing crisis screen (`src/core/crisis.ts`, then the add-only check in `src/core/chat-crisis.ts`). Zero model calls.
- **AMBIGUOUS** turns (vague distress, no crisis word) show the turn's bank card plus a fixed DRAFT soft line (`ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะคะ`) and a button that opens the crisis screen. No model text; the model is not called.
- Crisis detection stays rules-only on both paths. Extra chat-crisis rules also run when chat-first is off (`CHAT_CRISIS_CARD_FIRST = true`).

Screenshots from the local e2e run live in `shots/`:

| Start | Suggestions | Crisis |
| --- | --- | --- |
| ![Start screen](shots/s1-01-start.png) | ![Service suggestions](shots/s1-03-suggestions.png) | ![Crisis card](shots/c1-01-crisis-card.png) |

More stills (handoff labelled **DEMO — nothing was sent**, under-age gate, model-loading pill) are in the same folder.

## What it does

The app works **without any model**.

1. Start screen: not medical advice, on-device privacy, age band, quick-exit on every screen.
2. The person types a need in Thai. Crisis rules run first (`src/core/crisis.ts`), then rule-based mapping, then 1–3 services from `src/data/services.json` with an open-now check in Asia/Bangkok.
3. A handoff summary is built from a fixed template with PII stripped. The person can edit, approve, or cancel.
4. Approve shows a simulated handoff screen labelled **DEMO — nothing was sent**, plus the real public channel as text (not a live send).
5. An optional on-device Qwen3 model can refine low-confidence routing (card-first) or write experimental chat-first replies when `?chatFirst=1` is set. Crisis detection stays rules-only and always runs first.

## Setup and run

Needs Node.js 18+ (verified here on Node 22). The static server binds **127.0.0.1 only**.

```bash
npm ci
npm test                 # vitest run (unit tests)
npm run bank:validate    # answer-bank + guard
npm run e2e              # build + Playwright (headless Chrome on 127.0.0.1:4173)
npm run dev              # http://127.0.0.1:5173  (hot reload)
npm run build && node scripts/serve.mjs   # http://127.0.0.1:4173
```

Experimental chat-first demo (same servers, needs a prose-trained model): append `?chatFirst=1` to the URL.

`npm run e2e` uses `/usr/bin/google-chrome` (override with `CHROME_PATH`). Step screenshots go to `e2e-shots/` (gitignored). The WASM model e2e test is skipped when weights are not installed.

Optional filming bundle: `python3 scripts/make-bundle.py` → see `bundle/README-RUN.md`.

## Model setup

Weights are **never in this repository**. The demo runs on rules if they are missing.

The default model is the fine-tuned **Qwen3 0.6B** (`qwen3-0.6b-ft` in `src/config.ts`), WASM-only. It is a JSON card-choice fine-tune (`{o,c,q}`), not a prose chat model. It has **no URL** and is never downloaded. Place the GGUF yourself at `models/gguf/Qwen3-0.6B-jane-ft-Q4_K_M.gguf` (sha256 `1a8056e4f1d0afba32ab87c24f8c2740258b130a9bb7bb5311e742c921daf8e2`, 484220256 bytes), then `node scripts/fetch-weights.mjs --model qwen3-0.6b-ft --verify-only` to register it in `models/installed.json`.

If that GGUF is missing at load, the app falls back to installed `qwen3-1.7b`. If 1.7B is also missing, it logs a console warning, shows the rules-only / model-unavailable pill (`data-state="failed"`), and continues on rules.

To fetch the Qwen3-1.7B builds (WebGPU + WASM GGUF, about 2.1 GB) from their official pinned sources:

```bash
node scripts/fetch-weights.mjs
# optional larger WebGPU model:
node scripts/fetch-weights.mjs --model qwen3-4b
```

| `MODEL` (`src/config.ts`) | WebGPU | WASM (CPU) | Official source |
| --- | --- | --- | --- |
| `qwen3-0.6b-ft` (default) | none (WASM only) | GGUF Q4_K_M ~0.48 GB, JSON card-choice fine-tune (operator-placed, never fetched) | Jane fine-tune; Qwen3-0.6B base is [Apache-2.0](https://huggingface.co/Qwen/Qwen3-0.6B) |
| `qwen3-1.7b` (`?model=qwen3-1.7b`) | MLC q4f16 / q4f32 ~0.99 GB | GGUF Q4_K_M 1.11 GB | [Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B), [MLC build](https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC), [unsloth GGUF](https://huggingface.co/unsloth/Qwen3-1.7B-GGUF) |
| `qwen3-4b` | MLC q4f16 / q4f32 ~2.29 GB | falls back to 1.7B | [Qwen3 blog](https://qwenlm.github.io/blog/qwen3/) |
| `off` | none | none | rules only |

Files land in `models/` (gitignored) after sha256 checks against `scripts/weights-manifest.json`. The app loads them from `/models/` on 127.0.0.1 into Cache Storage (`model-weights-v1`, model files only). Testing overrides: `?model=off`, `?model=qwen3-1.7b`, `?runtime=webgpu`, `?runtime=wasm`.

Qwen3.5 0.8B/2B and Gemma are **not** fetched by these scripts. See `THIRD_PARTY.md`.

## Safety notes

- Eval and unit tests use **synthetic** prompts only. Do not commit real chat logs.
- **No logging of user messages.** Chat state is in memory. The static server does not receive chat content. There is no `console` logging of user text.
- **No image upload.** There is no file input.
- No `fetch`/XHR in the app; strict CSP (`default-src 'self'`). Source URLs are shown as text, not links.
- Nothing user-identifying is written to localStorage, IndexedDB, or cookies. sessionStorage may hold a single non-personal `jane.webgpu.failed` flag after a WebGPU device loss. Cache Storage holds model files only.
- Quick-exit and erase drop in-memory state.

## Licence

The **code** is under the Apache License 2.0 (see the root `LICENSE`). `package.json` `license` is `Apache-2.0`. The **answer-bank text** (cards under `src/data/bank/`: `answer_th`, titles, variants, key facts, triggers, chip labels) is licensed CC BY-SA 4.0 (see `src/data/bank/LICENSE`; attribution Opendream). That CC BY-SA grant covers the answer-bank text only: it does not cover illustrations, art, images, sprites, or the brand mark. The **eval question set** (`evals/` item files) is separately licensed CC BY-SA 4.0 as text (see `evals/LICENSE`; attribution Opendream). Quiz content is adapted from 'Judies, Opendream 2017' (Opendream owns Judies and relicenses its quiz content under CC BY-SA 4.0).
Illustration © Opendream, 2018. Some figures redrawn with AI assistance, 2026.
Art: 2018 *Sex Safe Safe* vector stars and approved figures in `src/assets/jane/` (all rights reserved; not covered by Apache-2.0 or CC BY-SA). Provenance: `src/assets/jane/MANIFEST.md`. Never use the 2020 Jane art. UI font is self-hosted Mitr (SIL OFL 1.1, Cadson Demak). Third-party models and other notices: `NOTICE` and `THIRD_PARTY.md`.

## Contact

Opendream — https://opendream.co.th/en/contact_en — info@opendream.co.th
