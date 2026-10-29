#!/usr/bin/env python3
"""Persistent llama.cpp worker for the model-first eval harness. JSON lines on stdin/stdout. Never logs prompt text."""
from __future__ import annotations

import argparse
import json
import sys
import time


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--threads", type=int, default=4)
    args = p.parse_args()
    from llama_cpp import Llama, LlamaGrammar

    llm = Llama(
        model_path=args.model,
        n_ctx=1024,
        n_threads=args.threads,
        n_gpu_layers=0,
        verbose=False,
    )
    sys.stdout.write(json.dumps({"ready": True, "threads": args.threads}) + "\n")
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        if req.get("cmd") == "quit":
            break
        req_id = req.get("req_id", req.get("id"))
        schema = req["schema"]
        grammar = LlamaGrammar.from_json_schema(json.dumps(schema))
        t0 = time.perf_counter()
        out = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": req["system"]},
                {"role": "user", "content": req["user"]},
            ],
            max_tokens=int(req.get("max_tokens", 32)),
            temperature=0,
            grammar=grammar,
        )
        ms = int((time.perf_counter() - t0) * 1000)
        choice = out["choices"][0]["message"]["content"] or ""
        usage = out.get("usage") or {}
        sys.stdout.write(
            json.dumps(
                {
                    "req_id": req_id,
                    "raw": choice,
                    "latencyMs": ms,
                    "promptTokens": int(usage.get("prompt_tokens") or 0),
                }
            )
            + "\n"
        )
        sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stdout.write(json.dumps({"error": type(e).__name__}) + "\n")
        sys.stdout.flush()
        raise
