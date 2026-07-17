#!/usr/bin/env bash
# The canonical twins mining batch (the seed-8/seed-12 methodology, settled
# 2026-07-14/15). Run from the repo root:
#   ./tools/mine-twins.sh <seed>            # foreground
#   nohup ./tools/mine-twins.sh <seed> &    # long runs
#
# One batch = 24 twin games + mirror pass + depth-8 verification gate.
# - Twins: identical default-weight hard bots, until-timeout; the strong
#   twin gets +5 beam width per level AND 4000ms vs 1000ms. Mistakes come
#   from search breadth/time, not style.
# - The GATE RUNS (default verifyCap 120). Never pass --verifyCap 0 here:
#   that silently ships unverified chains (the seed-6/8 mistake).
# - First-grab filter is ON by default; add --allowFirstGrab only for a
#   deliberate easy-Monday harvest.
# Extra args after the seed pass straight through to puzzle-miner.mjs.
#
# Output: tools/mined/mined-seed<seed>.json (+ chains-seed<seed>.ndjson
# streamed as found), log tee'd to tools/mined/run-seed<seed>-twins.log.
# New chains go into frontend/src/puzzle/minedPreviewData.json with
# devOnly:true first (?mined=N dev preview); drop the flag only after
# curation + a passing gate.
set -euo pipefail

SEED="${1:?usage: ./tools/mine-twins.sh <seed> [extra puzzle-miner args]}"
shift || true

cd "$(dirname "$0")/.."
LOG="tools/mined/run-seed${SEED}-twins.log"

docker compose run --rm --no-deps -v "$PWD":/repo -w /repo frontend \
  node tools/puzzle-miner.mjs --twins \
    --games 24 --seed "$SEED" \
    --playMs 1000 --strongMs 4000 \
    --twinDelta 5 --twinNoise 0.1 \
    "$@" > "$LOG" 2>&1

tail -8 "$LOG"
