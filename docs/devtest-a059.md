# Dev-test model switcher on the Nothing A059

Owner-only. This is **not** the shipped app. The production `dist/` build has no switcher, no turn log, and no arm code. Chat still promises no logs; the optional log below exists only in `dist-devtest/` and never ships.

GGUFs live **outside the repo** (they are gitignored). Nothing Gemma is committed, bundled, or published.

## 1. Produce the files (studio)

Fine-tunes land in `~/mr-robot/jane-demo-run/ft/` with a `SHA256SUMS` file. Any GGUF over ~1.9 GB must be split before the phone can load it:

```sh
llama-gguf-split --split-max-size 512M path/to/model.gguf path/to/model
```

Relay the GGUFs plus `SHA256SUMS` to Elsa over the private LAN, into `~/jane-devtest/models/devtest/` (outside this repo). Verify:

```sh
cd ~/jane-devtest/models/devtest
shasum -a 256 -c SHA256SUMS
```

Name files by arm id: `A-base.gguf`, `A-tuned.gguf`, … `F-tuned.gguf`. Shards keep the llama.cpp pattern `D-tuned-00001-of-00004.gguf`.

## 2. Write the manifest (Elsa)

From the repo:

```sh
node scripts/devtest/make-arms.mjs --dir ~/jane-devtest/models/devtest
```

That hashes each file (or shard set) and writes `~/jane-devtest/models/devtest/arms.json` with id, label, files, size, sha256, and `phone_ready`. A blob over 2 GiB, or a total over 4 GiB, is marked not phone-ready. Arms C and D are tagged **comparison only**.

## 3. Build and serve (Elsa)

Do **not** use port 4173 (another service on Elsa). Bind 127.0.0.1 only.

```sh
npm run build:devtest
node scripts/serve.mjs --port 4273 --dist dist-devtest --models ~/jane-devtest/models
```

`serve.mjs` already sends COOP/COEP, supports Range requests, and logs nothing.

## 4. Phone (A059)

```sh
adb reverse tcp:4273 tcp:4273
```

In Chrome on the phone open:

```
http://127.0.0.1:4273/?arm=A-base
```

127.0.0.1 is a secure context, so Cache Storage and cross-origin isolation work without TLS.

The DEV badge is always on screen. Tap it for the arm list. One tap (or a new `?arm=` URL) aborts the current turn, calls `Wllama.exit()`, drops other arms from the `devtest-weights-v1` cache, and reloads so only one model is in memory. With no `?arm=`, nothing loads.

Arm mode turns **model card-pick on** by default (`?modelPick=1`). Use `?modelPick=0` to test the legacy path. Locked card ids stay enforced on the pick path: `hiv.test.under18.000`, `price.trc.prep.000`, `ec.timing.b001`, `urgent.pills.000`. Crisis, guard, chip and locked turns stay rules-only.

The last-used arm's weights stay in Cache Storage (at most one arm). Use **Clear model cache** to drop them.

## 5. Optional turn log

Off by default. Opt in on the panel. It stays on this phone, in memory (and in `localStorage` only so a switch-reload does not wipe it). Export writes a JSON file on the phone; pull it with `adb pull`. Clear wipes it. ลบแชท and ออกทันที clear the in-memory rows. **Nothing is sent anywhere.**

Default rows store synthetic prompt ids from `evals/seed-set.json` and `evals/paraphrase-set.json`. Typed text is stored only after a second opt-in, and only after `stripPII`. Crisis rows store a tag, never text.

This log is absent from `dist/` and from the shipped app.

## 6. Gemma (arms C and D)

Private, local comparison on the owner's machines and phone. **Not distribution.** Nothing Gemma ships, goes into either app build, is published, or goes into the proposal until the owner clears the licence. The manifest marks C and D "comparison only"; the badge shows that tag while they are loaded.

## 7. wllama

This build keeps `@wllama/wllama` 3.8.1. Qwen3.5 (E, F) or Gemma 4 (D) may not load; that is a finding, not a reason to upgrade here.

## 8. Priority

Land **A-base / A-tuned** and **B-base / B-tuned** first. C–F are the same switcher once their files exist and `phone_ready` is true.
