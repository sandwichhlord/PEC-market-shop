#!/usr/bin/env bash
# Autonomous build loop: one fresh Claude Code session per phase until docs/PLAN.md is fully ticked.
#
# Usage:  ./autorun.sh
# Options (env vars):
#   MODE=auto              permission mode: auto (default, safe on your own machine) or bypassPermissions (containers/VMs only)
#   MODEL=                 e.g. opus or sonnet (blank = your Claude Code default)
#   MAX_ITERS=40           hard cap on sessions
#   STALL_WAIT=1200        seconds to wait when a session made no progress (usually a usage limit) before retrying
#   MAX_STALLS=12          give up after this many no-progress sessions in a row (~4h of waiting at default)
set -uo pipefail
cd "$(dirname "$0")"

# Keep a Mac awake for the whole run.
if [[ "$(uname)" == "Darwin" && -z "${CAFFEINATED:-}" ]] && command -v caffeinate >/dev/null; then
  CAFFEINATED=1 exec caffeinate -is "$0" "$@"
fi

MODE="${MODE:-auto}"
MODEL="${MODEL:-}"
MAX_ITERS="${MAX_ITERS:-40}"
STALL_WAIT="${STALL_WAIT:-1200}"
MAX_STALLS="${MAX_STALLS:-12}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
PROMPT_FILE=".claude/prompts/next-phase.md"
PLAN="docs/PLAN.md"

mkdir -p logs
LOG="logs/autorun.log"
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

[[ -d .git ]] || { echo "Run ./setup.sh first."; exit 1; }
command -v "$CLAUDE_BIN" >/dev/null || { echo "Claude Code not found."; exit 1; }

remaining()  { grep -cE '^- \[ \] \*\*P[0-9]+' "$PLAN" || true; }
next_phase() { grep -m1 -E '^- \[ \] \*\*P[0-9]+' "$PLAN" | sed -E 's/^- \[ \] \*\*([^*]+)\*\*.*/\1/'; }
fingerprint() { { git rev-parse HEAD 2>/dev/null; git status --porcelain; git diff 2>/dev/null; } | cksum; }

stalls=0
log "=== autorun start — mode=$MODE model=${MODEL:-default} — $(remaining) phases remaining ==="

for (( i=1; i<=MAX_ITERS; i++ )); do
  left=$(remaining)
  if (( left == 0 )); then log "All phases complete. 🎉"; break; fi

  phase=$(next_phase)
  before=$(fingerprint)
  log "Session $i — working on: $phase ($left left)"

  args=(-p "$(cat "$PROMPT_FILE")" --permission-mode "$MODE" --output-format stream-json --verbose)
  [[ -n "$MODEL" ]] && args+=(--model "$MODEL")

  start=$(date +%s)
  "$CLAUDE_BIN" "${args[@]}" > "logs/session-$(printf '%02d' "$i").jsonl" 2>&1
  code=$?
  mins=$(( ($(date +%s) - start) / 60 ))

  after=$(fingerprint)
  if [[ "$before" == "$after" ]]; then
    stalls=$((stalls + 1))
    log "  ↳ no progress (exit $code, ${mins}m). Stall $stalls/$MAX_STALLS — likely a usage limit. Waiting $((STALL_WAIT/60))m."
    tail -c 600 "logs/session-$(printf '%02d' "$i").jsonl" >> "$LOG" 2>/dev/null; echo >> "$LOG"
    if (( stalls >= MAX_STALLS )); then log "Too many stalls in a row — stopping. Re-run ./autorun.sh to resume."; exit 1; fi
    sleep "$STALL_WAIT"
    continue
  fi
  stalls=0

  if [[ "$(remaining)" -lt "$left" ]]; then
    log "  ↳ ✅ $phase done in ${mins}m — $(git log -1 --format=%s)"
  else
    log "  ↳ progress but $phase not finished yet (exit $code, ${mins}m) — next session continues it."
  fi
done

if (( $(remaining) > 0 )); then
  log "Stopped with $(remaining) phase(s) left (hit MAX_ITERS=$MAX_ITERS). Re-run ./autorun.sh to resume."
  exit 1
fi
log "Done. Next: read docs/PROGRESS.md (check 'Blocked / needs human'), then: npm run dev"
