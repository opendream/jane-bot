# Model-first pick variants (measurement only)

cloud VM numbers; phone numbers are 23 Oct figures (1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank)

VM: Intel(R) Xeon(R) Processor, 4 threads (logical CPUs). Picker: `llama.cpp:Qwen3-1.7B-Q4_K_M:t4`. Pick timeout 20000 ms. Bank: 35 reviewed cards. Eval/harness only — no `src/` runtime change. GGUF sha256 `b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897`.

Phone (23 Oct, not this run): 1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank.

Judged labels are agent-judged, pending human spot-check. Crisis / guard / chip / locked-top-1 never call the model (runtime lock unchanged). Every variant still calls the model on every non-locked free-text turn.

Target: wrong-card ≤ rules-only (15.0% judged / 17.9% seed+paraphrase) while the model still answers every non-locked free-text turn.

Timeout isolation (this branch): llama picker waiters are keyed by `req_id`. Abort/timeout clears the waiter so a late worker line cannot resolve the next pick. Mock-worker unit test covers the race. **Timeouts this run: 0** on every variant and set (20 s budget).

PR #33 baseline timeouts: committed `evals/model-first/results.json` has no timeout counter and no per-item latencies (timed-out picks would have been `latencyMs: null` and dropped from median/p90). Timeout budget was 20 s; reported p90 was 1.06–1.17 s on successful picks. The PR #33 agent transcript has no `aborted` / timed-out pick logs. This V0 re-run (same GGUF, 4-thread Xeon, 20 s budget) also had **0 timeouts**. The stale-pending bug only fires after a timeout, so **#33’s headline numbers were almost certainly not skewed by this race.**

V0 vs PR #33 judged k=3: this run 79.7% acc / 19.8% wrong-card / 0 timeouts vs #33 80.2% / 19.3% (seed+para k=3 matches #33 exactly at 53.6% / 25.0%). Small judged drift is llama.cpp CPU non-bit-stability, not timeouts.

V2 vs V0 prompt/latency (judged k=3): prompt tokens 154 → 194 (**+40 / +26%**); median latency 892 → 935 ms (**+43 ms**); p90 1176 → 1300 ms (**+124 ms**).

Variants:
- **V0** current model-first (reproduce PR #33 baseline).
- **V1** confident-agree: model picks every non-locked turn; if rules were confident and the model disagrees or says none, show the rules card (`rules-fallback`).
- **V2** card descriptions: V0 prompt with title + first reviewed key_fact per shortlisted card.
- **V3** V1 + V2.
- **V4** V3 + 2 synthetic Thai few-shot examples (optional).

## judged868 (n=187)

| Policy | k | Acc | Wrong-card | None | Fallback | Model-shown | Agree rules top-1 | Crisis recall | Timeouts | Latency med/p90 | Prompt tok med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-only | – | 78.6% | 15.0% | 12.8% | 0.0% | – | – | 100.0% | 0 | – | – |
| v0 model-first (baseline) | 3 | 79.7% | 19.8% | 4.3% | 17.6% | 76.4% | 72.7% | 100.0% | 0 | 892 ms / 1176 ms | 154 |
| v1 confident-agree | 3 | 81.8% | 17.6% | 4.3% | 20.3% | 72.9% | 75.4% | 100.0% | 0 | 892 ms / 1176 ms | 154 |
| v2 card descriptions | 3 | 81.3% | 18.2% | 4.3% | 16.0% | 78.6% | 74.9% | 100.0% | 0 | 935 ms / 1300 ms | 194 |
| v3 confident-agree + descriptions | 3 | 82.4% | 17.1% | 4.3% | 17.6% | 76.4% | 76.5% | 100.0% | 0 | 935 ms / 1300 ms | 194 |
| v4 V3 + few-shot | 3 | 78.1% | 21.9% | 2.7% | 8.0% | 89.3% | 71.7% | 100.0% | 0 | 1049 ms / 1314 ms | 394 |

### Locked-card routing (current always-lock, rules top-1)

Queries whose rules top-1 is a locked card. Low-confidence = not the existing +1 unique-hit margin.

| Locked id | n top-1 | low-conf | low-conf wrong | all wrong |
| --- | --- | --- | --- | --- |
| hiv.test.under18.000 | 5 | 5 | 0 | 0 |
| price.trc.prep.000 | 7 | 7 | 0 | 0 |
| ec.timing.b001 | 10 | 10 | 2 | 2 |
| urgent.pills.000 | 10 | 10 | 2 | 2 |
| **total** | 32 | 32 | 5 | – |

## seed+paraphrase (n=56)

| Policy | k | Acc | Wrong-card | None | Fallback | Model-shown | Agree rules top-1 | Crisis recall | Timeouts | Latency med/p90 | Prompt tok med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-only | – | 55.4% | 17.9% | 44.6% | 0.0% | – | – | 100.0% | 0 | – | – |
| v0 model-first (baseline) | 3 | 53.6% | 25.0% | 39.3% | 46.4% | 42.2% | 28.6% | 100.0% | 0 | 689 ms / 1153 ms | 167 |
| v1 confident-agree | 3 | 53.6% | 25.0% | 39.3% | 48.2% | 40.0% | 30.4% | 100.0% | 0 | 689 ms / 1153 ms | 167 |
| v2 card descriptions | 3 | 57.1% | 26.8% | 32.1% | 44.6% | 44.4% | 30.4% | 100.0% | 0 | 832 ms / 1301 ms | 206 |
| v3 confident-agree + descriptions | 3 | 57.1% | 26.8% | 32.1% | 46.4% | 42.2% | 32.1% | 100.0% | 0 | 832 ms / 1301 ms | 206 |
| v4 V3 + few-shot | 3 | 58.9% | 32.1% | 25.0% | 32.1% | 60.0% | 30.4% | 100.0% | 0 | 1138 ms / 1328 ms | 406 |

### Locked-card routing (current always-lock, rules top-1)

Queries whose rules top-1 is a locked card. Low-confidence = not the existing +1 unique-hit margin.

| Locked id | n top-1 | low-conf | low-conf wrong | all wrong |
| --- | --- | --- | --- | --- |
| hiv.test.under18.000 | 0 | 0 | 0 | 0 |
| price.trc.prep.000 | 0 | 0 | 0 | 0 |
| ec.timing.b001 | 1 | 1 | 0 | 0 |
| urgent.pills.000 | 0 | 0 | 0 | 0 |
| **total** | 1 | 1 | 0 | – |

## crisis-heldout (n=6)

| Policy | k | Acc | Wrong-card | None | Fallback | Model-shown | Agree rules top-1 | Crisis recall | Timeouts | Latency med/p90 | Prompt tok med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-only | – | 100.0% | 0.0% | 0.0% | 0.0% | – | – | 100.0% | 0 | – | – |
| v0 model-first (baseline) | 3 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 0 | – / – | – |
| v1 confident-agree | 3 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 0 | – / – | – |
| v2 card descriptions | 3 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 0 | – / – | – |
| v3 confident-agree + descriptions | 3 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 0 | – / – | – |
| v4 V3 + few-shot | 3 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 0 | – / – | – |

### Locked-card routing (current always-lock, rules top-1)

Queries whose rules top-1 is a locked card. Low-confidence = not the existing +1 unique-hit margin.

| Locked id | n top-1 | low-conf | low-conf wrong | all wrong |
| --- | --- | --- | --- | --- |
| hiv.test.under18.000 | 0 | 0 | 0 | 0 |
| price.trc.prep.000 | 0 | 0 | 0 | 0 |
| ec.timing.b001 | 0 | 0 | 0 | 0 |
| urgent.pills.000 | 0 | 0 | 0 | 0 |
| **total** | 0 | 0 | 0 | – |

## Extra k on best variant (v3)

| Set | k | Acc | Wrong-card | None | Fallback | Model-shown | Timeouts | Latency med/p90 | Prompt tok med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| judged868 | 5 | 82.4% | 17.1% | 4.3% | 17.1% | 77.1% | 0 | 962 ms / 1481 ms | 261 |
| seed+paraphrase | 5 | 57.1% | 26.8% | 32.1% | 44.6% | 44.4% | 0 | 921 ms / 1689 ms | 216 |

## Lock-only-on-confident simulation (eval only; runtime lock unchanged)

Proposal: lock only when rules are confident. Low-confidence locked top-1 goes to the model shortlist like any other turn. A locked card can still only be shown if rules shortlisted it. `hiv.test.under18.000` still requires the under-18 privacy shortlist gate.

Simulated on **v3** k=3.

| Set | Policy | Acc | Wrong-card | None | Fallback | Model-shown |
| --- | --- | --- | --- | --- | --- | --- |
| judged868 | v3 + lock-if-confident | 78.6% | 20.9% | 4.3% | 20.3% | 77.9% |
| seed+paraphrase | v3 + lock-if-confident | 57.1% | 26.8% | 32.1% | 46.4% | 43.5% |

### Under-18 HIV-privacy probes (must not move)

15 probes from retrieve fixtures + under-18 HIV questions. Moved vs always-lock: **3**. Expect-id failures: 3. Forbidden-id failures: 2.

| Probe | group | always-lock | sim | moved |
| --- | --- | --- | --- | --- |
| ตรวจเอชไอวีโดยไม่บอกผู้ปกครอง | under18_hiv | hiv.test.under18.000 | disease.hiv.002 (model) | yes |
| เด็กตรวจเอชไอวีได้ไหม | under18_hiv | hiv.test.under18.000 | disease.hiv.000 (model) | yes |
| อยากตรวจเอชไอวีโดยไม่บอกผู้ปกครอง | under18_hiv | hiv.test.under18.000 | disease.hiv.002 (model) | yes |

## Target and recommendation

- **v0**: judged wrong-card 19.8% (rules 15.0%) > ; seed+para 25.0% (rules 17.9%); model-shown 76.4%.
- **v1**: judged wrong-card 17.6% (rules 15.0%) > ; seed+para 25.0% (rules 17.9%); model-shown 72.9%.
- **v2**: judged wrong-card 18.2% (rules 15.0%) > ; seed+para 26.8% (rules 17.9%); model-shown 78.6%.
- **v3**: judged wrong-card 17.1% (rules 15.0%) > ; seed+para 26.8% (rules 17.9%); model-shown 76.4%.
- **v4**: judged wrong-card 21.9% (rules 15.0%) > ; seed+para 32.1% (rules 17.9%); model-shown 89.3%.
- **v3_k5**: judged wrong-card 17.1% (rules 15.0%) > ; seed+para 26.8% (rules 17.9%); model-shown 77.1%.

**None meets the target on both sets.** Closest (lowest judged wrong-card among variants that still show the model): **v3**.

Lock-if-confident simulation on v3 k=3: judged acc 78.6% / wrong-card 20.9%; seed+para acc 57.1% / wrong-card 26.8%. HIV-privacy probes moved: 3/15.

Recommendation: do **not** relax the runtime lock — under-18 HIV-privacy probes moved under the simulation.

## Unverified

- Judged labels are agent-judged, pending human spot-check.
- llama.cpp CPU is not bit-stable across sequential passes; V0 judged k=3 is 79.7/19.8 vs PR #33 80.2/19.3 (one–two items). Seed+para k=3 matched #33 exactly.
- PR #33 committed results cannot prove a timeout count (no per-item latencies). Inference from p90 ≪ 20 s, no abort logs, and this 0-timeout V0 re-run: **#33 timeouts = 0 (very likely)**.
- Phone latency is the 23 Oct figure, not this VM.
- Runtime lock is unchanged; lock-if-confident is harness simulation only.
- Cache under `evals/model-first/cache/` is gitignored and not part of the deliverable.
