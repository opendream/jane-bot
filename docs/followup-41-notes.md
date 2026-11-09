# Follow-up for PR #41

Branch: `feat/jane-v41-followup` (from `6468b172f45d5142cf5acbd18f8c6a769b8aa4a9`).
PR #41 is not updated; `feat/jane-v41` stays at `6468b17`.

## Fixes

1. **Fallback model.** Default remains `qwen3-0.6b-ft`. If that GGUF is not in the mocked/installed list, `startModel` loads `qwen3-1.7b` when that model is present. Only if 1.7B is also missing does it warn, show the failed / rules-only pill, and stay on rules. `?model=qwen3-1.7b` is unchanged.

2. **Duplicate card.** When the model returns `c=1` and the quoted card text is the same as the closing card, the chat bubble is opener + follow-up only. The answer appears once, on the card bubble. A different quoted card still stays in the chat text.

## Fix round 3

| Check | Result |
| --- | --- |
| vitest | **3217 passed**, 1 skipped (3218 total), 70 files, pass |
| e2e (Playwright) | **120 passed**, 1 skipped (121 total), pass (`model-wasm` skipped: weights not installed) |
| `tests/unit/codex-phrase-cases-41.test.ts` | **13 passed** (9 existing + 3 fallback cases + 1 duplicate-card case) |
| `npm run build` | pass (`tsc --noEmit` + Vite production build) |
| `npm run bank:validate` | pass (35 cards in 8 files, 0 errors, 0 warnings, `guard: clean`) |
| `src/core/crisis.ts` blob | `411f1531a32fe4b0353fc59975b2cdfec0a6c713` (unchanged) |
| `src/core/guard.ts` blob | `19fff7350b90616b1b1d908a91f4c664bfb369bc` (unchanged) |

Not verified: real GGUF/WebGPU weights (unit tests mock `installed`; `model-wasm` e2e skipped). No PR opened.
