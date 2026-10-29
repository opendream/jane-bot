# Model-first eval (measurement only)

cloud VM numbers; phone numbers are 23 Oct figures (1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank)

VM: Intel(R) Xeon(R) Processor, 4 threads (logical CPUs). Picker: `llama.cpp:Qwen3-1.7B-Q4_K_M:t4`. Pick timeout 20000 ms. Bank: 35 reviewed cards at this commit. Backup shortlist is harness-only (not src/ runtime). GGUF sha256 `b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897`.

Phone (23 Oct, not this run): 1.7B 10.4 s median, 19.4 s p90, Nothing A059, 6-card placeholder bank.

Judged labels are agent-judged, pending human spot-check. Crisis / guard / chip / locked-top-1 never call the model.

## judged868 (n=187)

| Policy | k | Acc | Wrong-card | Crisis recall | Crisis model calls | Locked integrity | Fallback | No-cand | Agree rules top-1 | Latency med/p90 | Prompt tok med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-only | – | 78.6% | 15.0% | 100.0% | 0 | 82.1% | 0.0% | 12.8% | – | – | – |
| model-first | 3 | 80.2% | 19.3% | 100.0% | 0 | 82.1% | 18.2% | 0.0% | 71.7% | 827 ms / 1058 ms | 154 |
| model-first | 5 | 78.1% | 21.4% | 100.0% | 0 | 82.1% | 13.4% | 0.0% | 72.7% | 851 ms / 1104 ms | 187 |

Backup shortlist (char 2–3-gram BM25 top-3 on turns where rules retrieve 0 candidates; locked cards excluded; crisis turns never consult it):
- k=3: 24 no-rules items, 12 with a gold card, recall@3 12/12; model pick correct 10 / wrong 6 / none 8.
- k=5: 24 no-rules items, recall@3 12/12; pick correct 10 / wrong 7 / none 7.

## seed+paraphrase (n=56)

| Policy | k | Acc | Wrong-card | Crisis recall | Crisis model calls | Locked integrity | Fallback | No-cand | Agree rules top-1 | Latency med/p90 | Prompt tok med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-only | – | 55.4% | 17.9% | 100.0% | 0 | 20.0% | 0.0% | 44.6% | – | – | – |
| model-first | 3 | 53.6% | 25.0% | 100.0% | 0 | 20.0% | 44.6% | 0.0% | 32.1% | 645 ms / 1083 ms | 167 |
| model-first | 5 | 48.2% | 30.4% | 100.0% | 0 | 20.0% | 39.3% | 0.0% | 30.4% | 832 ms / 1165 ms | 171 |

Backup shortlist (char 2–3-gram BM25 top-3 on turns where rules retrieve 0 candidates; locked cards excluded; crisis turns never consult it):
- Retrieve-empty including crisis: 35/56 in the harness (crisis short-circuits before retrieve; a retrieve-only dump on the same 56 strings is ~33/56 because two crisis texts still match some triggers). Backup-eligible after excluding crisis: 25.
- k=3: 25 no-rules items, 15 with a gold card, recall@3 4/15; model pick correct 0 / wrong 5 / none 20.
- k=5: 25 no-rules items, recall@3 4/15; pick correct 0 / wrong 6 / none 19.

## crisis-heldout (n=6)

| Policy | k | Acc | Wrong-card | Crisis recall | Crisis model calls | Locked integrity | Fallback | No-cand | Agree rules top-1 | Latency med/p90 | Prompt tok med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-only | – | 100.0% | 0.0% | 100.0% | 0 | 100.0% | 0.0% | 0.0% | – | – | – |
| model-first | 3 | 100.0% | 0.0% | 100.0% | 0 | 100.0% | 0.0% | 0.0% | 0.0% | – / – | – |
| model-first | 5 | 100.0% | 0.0% | 100.0% | 0 | 100.0% | 0.0% | 0.0% | 0.0% | – / – | – |

Backup shortlist (char 2–3-gram BM25 top-3 on turns where rules retrieve 0 candidates; locked cards excluded; crisis turns never consult it):
- k=3: 0 no-rules items, 0 with a gold card, recall@3 0/0; model pick correct 0 / wrong 0 / none 0.
- k=5: 0 no-rules items, recall@3 0/0; pick correct 0 / wrong 0 / none 0.
