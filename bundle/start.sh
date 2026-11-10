#!/usr/bin/env bash
# เจน · Jane demo: run bundle. Needs only Node 18+ (no npm install, no GPU required).
#   ./start.sh                     # fetch weights once (~2.1 GB, sha256-checked), serve on 127.0.0.1:4173, open Chrome
#   ./start.sh --model qwen3-4b    # optional bigger model (WebGPU only, ~2.3 GB more)
#   ./start.sh --no-fetch          # serve only (after the first run, works with Wi-Fi off)
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-4173}"
MODEL="qwen3-1.7b"; FETCH=1
while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2;;
    --no-fetch) FETCH=0; shift;;
    *) echo "unknown option $1"; exit 2;;
  esac
done
if ! command -v node >/dev/null 2>&1; then echo "Node.js 18+ is required: https://nodejs.org"; exit 1; fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then echo "Node $NODE_MAJOR found; Node 18+ is required."; exit 1; fi

echo "== 1/3 verify app files"
node scripts/verify-dist.mjs

if [ "$FETCH" = 1 ]; then
  echo "== 2/3 model weights (downloaded once from the original sources, checked by sha256)"
  if ! node scripts/fetch-weights.mjs --model "$MODEL"; then
    echo "!! weight download incomplete. The demo still works on rules only; re-run ./start.sh to resume."
  fi
else
  echo "== 2/3 skipping weight download (--no-fetch)"
  node scripts/fetch-weights.mjs --model "$MODEL" --verify-only >/dev/null 2>&1 || echo "   (some weights missing: the app will use rules only)"
fi

URL="http://127.0.0.1:${PORT}/"
[ "$MODEL" != "qwen3-1.7b" ] && URL="${URL}?model=${MODEL}"
echo "== 3/3 serving on ${URL}  (127.0.0.1 only; Ctrl+C to stop)"
( sleep 1
  if [ "$(uname)" = "Darwin" ]; then open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
  elif command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1 || true; fi ) &
exec node scripts/serve.mjs --port "$PORT"
