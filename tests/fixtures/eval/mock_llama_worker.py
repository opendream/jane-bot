#!/usr/bin/env python3
"""Mock JSON-line llama worker for picker timeout tests. Never loads a model. Echoes request id."""
from __future__ import annotations

import json
import os
import sys
import time

DELAY_MS = int(os.environ.get("MOCK_DELAY_MS", "250"))
DELAY_TOKEN = os.environ.get("MOCK_DELAY_TOKEN", "DELAY")


def reply_id(user: str) -> str:
    if "SECOND" in user:
        return "card.fast.000"
    if "FIRST" in user or DELAY_TOKEN in user:
        return "card.slow.000"
    return "none"


def main() -> None:
    sys.stdout.write(json.dumps({"ready": True, "mock": True}) + "\n")
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        if req.get("cmd") == "quit":
            break
        req_id = req.get("req_id", req.get("id"))
        user = req.get("user") or ""
        if DELAY_TOKEN in user:
            time.sleep(DELAY_MS / 1000)
        raw = json.dumps({"id": reply_id(user)})
        sys.stdout.write(
            json.dumps(
                {
                    "req_id": req_id,
                    "raw": raw,
                    "latencyMs": DELAY_MS if DELAY_TOKEN in user else 1,
                    "promptTokens": 3,
                }
            )
            + "\n"
        )
        sys.stdout.flush()


if __name__ == "__main__":
    main()
