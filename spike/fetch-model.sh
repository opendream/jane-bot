#!/usr/bin/env bash
# Downloads WebLLM prebuilt weights + WebGPU libs ONCE to the box, so the browser loads them from 127.0.0.1 only.
set -euo pipefail
cd "$(dirname "$0")/models"
for MID in "$@"; do
  mkdir -p "$MID/resolve/main"
  files=$(curl -sS "https://huggingface.co/api/models/mlc-ai/$MID" | python3 -c 'import json,sys;print("\n".join(s["rfilename"] for s in json.load(sys.stdin)["siblings"]))')
  for f in $files; do
    [ -s "$MID/resolve/main/$f" ] || curl -sSL --retry 3 -o "$MID/resolve/main/$f" "https://huggingface.co/mlc-ai/$MID/resolve/main/$f"
  done
  base=${MID%-MLC}
  curl -sSL --retry 3 -o "libs/${base}_cs1k-webgpu.wasm" "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/${base}_cs1k-webgpu.wasm"
  echo "done $MID"
done
