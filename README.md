# พี่เจน · Jane: SRH referral demo, milestones 1–2

Private prototype. Not published, no remote, no deploy.

## Licence

The **code** is under the Apache License 2.0 (see the root `LICENSE`). The **answer-bank text** (cards under `src/data/bank/`: `answer_th`, titles, variants, key facts, triggers, chip labels) is licensed CC BY-SA 4.0 (see `src/data/bank/LICENSE`; attribution Opendream). That CC BY-SA grant covers the answer-bank text only: it does not cover illustrations, art, images, sprites, or the brand mark. The **eval question set** (`evals/` item files) is separately licensed CC BY-SA 4.0 as text (see `evals/LICENSE`; attribution Opendream). Quiz content is adapted from 'Judies, Opendream 2017' (Opendream owns Judies and relicenses its quiz content under CC BY-SA 4.0).
Name: **พี่เจน** (Thai) / **Jane** (English), `PRODUCT_NAME` / `PRODUCT_NAME_EN` in `src/config.ts` (Keng, 22 Oct 19:49 BKK).
Illustration © Opendream, 2018
Art: 2018 *Sex Safe Safe* vector stars in `src/assets/jane/` (all rights reserved; not covered by Apache-2.0 or CC BY-SA). The small mark (`src/assets/mark.svg`) was drawn in code for this build and is also the favicon. Never use the 2020 Jane art. UI font is self-hosted Mitr (SIL OFL 1.1, Cadson Demak). Minimum age: `MIN_AGE` (default 15).
**All Thai copy and the crisis phrase list are DRAFT** until a Thai SRH/safety reviewer signs off.

## What it does (works without any model)

1. Start screen: not medical advice · privacy (on device, no logs) · age band (15+). Quick-exit button on every screen.
2. She describes her need in Thai → **crisis check first** (`src/core/crisis.ts`) → rule-based need mapping
   (`src/core/intent.ts`) → 1–3 services from the cited data file (`src/data/services.json`) with an
   open-now check in Asia/Bangkok time (`src/core/openNow.ts`).
3. Handoff summary from a fixed template, PII stripped (`src/core/summary.ts`); she can edit, approve or cancel.
4. Approve → simulated handoff screen labelled **DEMO — nothing was sent**, plus the real public channel.
5. Crisis phrases override everything: the matching helplines with tap-to-call (`tel:`). Mixed or unclear shows all four (1323 / 1300 / 1669 / 191).

6. Five acceptance scenarios: S1 pregnancy, S2 emergency contraception, S3 HIV test, S4 consent (Teen Club / 1323 / 1300;
   being forced → crisis, 191 then 1300), S5 mental health (1323 first; suicidal wording → crisis override).
7. Crisis detection has two levels: **override** (full crisis screen) and **banner** (topic/fiction/news or resolved mild
   wording: normal flow plus a crisis strip with the numbers). False-positive probe: `evals/crisis-fp-set.json` → `evals/crisis-scorecard.md`.

## On-device model (optional; the app works without it)

Qwen3 (Apache-2.0) only. Typhoon is on hold until the OpenTyphoon terms are cleared. Order: **WebGPU** via WebLLM (real GPU only;
SwiftShader is ignored) → **WASM** via wllama (CPU) → **rules**. If WebGPU loads then loses the device, the pill is not left on "ready": WebLLM is torn down and WASM is tried next. Choose in `src/config.ts` (`MODEL`) or with `?model=` / `?runtime=`.

| `MODEL` | WebGPU | WASM (CPU) |
| --- | --- | --- |
| `qwen3-1.7b` (default) | q4f16 0.99 GB (q4f32 0.99 GB if no shader-f16) | GGUF Q4_K_M 1.11 GB |
| `qwen3-4b` | q4f16 / q4f32 2.29 GB | no build (GGUF 2.5 GB > wllama 2 GB limit) → falls back to 1.7B |

- Rules decide when confident; the model is consulted only for low-confidence text (8 s timeout) and its answer is validated.
  Summary polish runs in the background, only touches her own line, and is discarded if it adds numbers, crisis words or length.
  Crisis detection is rules-only and always runs first.
- Weights are self-hosted: `node scripts/fetch-weights.mjs` downloads pinned revisions (`scripts/weights-manifest.json`) from the
  original sources, checks sha256, and writes `models/` (gitignored). The app loads them from `/models/` on 127.0.0.1 into
  Cache Storage (`model-weights-v1`, model files only), after which it runs fully offline.
- Header pill shows the state: loading (flow usable meanwhile) / "โมเดลในเครื่อง: <name> · ออฟไลน์" / rules only.
- Eval: `node scripts/eval-model.mjs` → `evals/model-scorecard.md` (rules vs model vs combined).

## Privacy guarantees (checked by the e2e tests)

- No `fetch`/XHR in the app; strict CSP (`default-src 'self'`); no external fonts, scripts or links (source URLs are text).
- State is in memory only: nothing in localStorage, IndexedDB or cookies. sessionStorage may hold a single non-personal
  `jane.webgpu.failed` flag after a WebGPU device loss so the next load skips the broken GPU and tries WASM. Cache Storage holds model files only.
- No logging of user text; the static server never receives chat content.

## Run locally (bound to 127.0.0.1 only)

```bash
npm ci
npm run dev        # http://127.0.0.1:5173  (dev, hot reload)
node scripts/fetch-weights.mjs     # once, ~2.1 GB (optional: app works on rules without it)
# closest to filming (same server as the run bundle):
npm run build && node scripts/serve.mjs   # http://127.0.0.1:4173
```

## Tests

```bash
npm test           # unit tests + seed set scorecard (writes evals/scorecard.md)
npm run e2e        # builds, serves on 127.0.0.1:4173, headless Chrome; 5 scenarios, crisis, banner, under-age,
                   # and the WASM model test (persistent profile; zero weight/flow requests once warm; skipped without weights)
```
E2E uses `/usr/bin/google-chrome` (override with `CHROME_PATH`). Step screenshots go to `e2e-shots/`; key ones are in `shots/`.
The e2e run fixes the browser clock (Playwright clock API) to set BKK times.

## Model spike (`spike/`, not part of the app bundle)

`spike/fetch-model.sh` downloads WebLLM prebuilt Qwen3-1.7B weights and WebGPU libs once to the box;
`spike/webllm-spike.html` loads them from `127.0.0.1` only. On a machine without a GPU, Chrome's SwiftShader
WebGPU adapter (`--enable-unsafe-webgpu`) can run the q4f32_1 build on CPU (very slow, wiring proof only).

## Data sources

Every service and crisis line cites a public source with a check date (BKK) in `src/data/services.json`.
Items marked `"verification": "partial"` need re-checking before filming (Teen Club hours, YFHS list). 1663 hours are 09:00–21:00 daily (D3; operator / RSATHAI / NHSO).

## Run bundle for the filming laptop

`python3 scripts/make-bundle.py` → `dist-bundle/jane-demo-run-bundle-<stamp>.zip` (prebuilt app + Node-only scripts; no weights).
On the laptop: unzip, `./start.sh` (or `start.command`). See `bundle/README-RUN.md` and `bundle/FILMING-CHECKLIST.md`.
