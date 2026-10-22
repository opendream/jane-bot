# SRH referral demo (placeholder name), milestone 1

Private prototype. Not published, no remote, no deploy. Apache-2.0 (see `LICENSE`).
Product name is a placeholder: change `PRODUCT_NAME` in `src/config.ts`. Minimum age: `MIN_AGE` (default 15).
**All Thai copy and the crisis phrase list are DRAFT** until a Thai SRH/safety reviewer signs off.

## What it does (works without any model)

1. Start screen: not medical advice · privacy (on device, no logs) · age band (15+). Quick-exit button on every screen.
2. She describes her need in Thai → **crisis check first** (`src/core/crisis.ts`) → rule-based need mapping
   (`src/core/intent.ts`) → 1–3 services from the cited data file (`src/data/services.json`) with an
   open-now check in Asia/Bangkok time (`src/core/openNow.ts`).
3. Handoff summary from a fixed template, PII stripped (`src/core/summary.ts`); she can edit, approve or cancel.
4. Approve → simulated handoff screen labelled **DEMO — nothing was sent**, plus the real public channel.
5. Crisis phrases override everything: 1323 / 1300 / 1669 / 191 with tap-to-call (`tel:`).

Model hook: `src/llm/adapter.ts` (`LLMAdapter`). A model may rank intents and reword the summary; output is
validated and the rules are the fallback on error, timeout or invalid output. Crisis detection never uses the model.

## Privacy guarantees (checked by the e2e tests)

- No `fetch`/XHR in the app; strict CSP (`default-src 'self'`); no external fonts, scripts or links (source URLs are text).
- State is in memory only: nothing in localStorage, sessionStorage, IndexedDB, cookies or Cache Storage.
- No logging of user text; the static server never receives chat content.

## Run locally (bound to 127.0.0.1 only)

```bash
npm ci
npm run dev        # http://127.0.0.1:5173  (dev, hot reload)
# or, closest to filming:
npm run build && npm run preview   # http://127.0.0.1:4173
```

## Tests

```bash
npm test           # unit tests + seed set scorecard (writes evals/scorecard.md)
npm run e2e        # builds, serves on 127.0.0.1:4173, headless Chrome; 3 Thai scenarios + crisis + under-age
```
E2E uses `/usr/bin/google-chrome` (override with `CHROME_PATH`). Step screenshots go to `e2e-shots/`; key ones are in `shots/`.
The e2e run fixes the browser clock (Playwright clock API) to set BKK times.

## Model spike (`spike/`, not part of the app bundle)

`spike/fetch-model.sh` downloads WebLLM prebuilt Qwen3-1.7B weights and WebGPU libs once to the box;
`spike/webllm-spike.html` loads them from `127.0.0.1` only. On a machine without a GPU, Chrome's SwiftShader
WebGPU adapter (`--enable-unsafe-webgpu`) can run the q4f32_1 build on CPU (very slow, wiring proof only).

## Data sources

Every service and crisis line cites a public source with a check date (BKK) in `src/data/services.json`.
Items marked `"verification": "partial"` need re-checking before filming (Teen Club hours, YFHS list, 1663 hours conflict).
