#!/usr/bin/env bash
# Start (or find) this session's "Send to Claude" receiver. Idempotent.
#
#   bash listen.sh [session-id]
#
# It prints KEY=VALUE lines:
#   STATUS=STARTED|RUNNING|UNAVAILABLE, plus URL=…, LOG=… when a receiver is up.
# The agent then exports HTML_ARTIFACT_SUBMIT_URL=$URL before building, and arms a Monitor on
#   tail -f $LOG | grep --line-buffered HTML_ARTIFACT_SUBMIT
# A restart reuses the previous token and port, so pages built earlier keep working.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SID="${1:-${CLAUDE_CODE_SESSION_ID:-default}}"
BASE="${TMPDIR:-/tmp}/html-artifact-$SID"
PIDF="$BASE.pid" URLF="$BASE.url" LOG="$BASE.log"

if [ -n "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ] || ! command -v node >/dev/null 2>&1; then
  echo "STATUS=UNAVAILABLE"   # Web sessions can't reach the browser; pages fall back to the clipboard.
  exit 0
fi

if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null && [ -s "$URLF" ]; then
  echo "STATUS=RUNNING"; echo "URL=$(cat "$URLF")"; echo "LOG=$LOG"; exit 0
fi

PREV="$( [ -s "$URLF" ] && cat "$URLF" || true )"
PORT="$(printf '%s' "$PREV" | sed -nE 's#^http://127\.0\.0\.1:([0-9]+)/.*#\1#p')"
TOKEN="$(printf '%s' "$PREV" | sed -nE 's#.*[?&]t=([0-9a-f]+).*#\1#p')"

: > "$LOG"
HTML_ARTIFACT_PORT="${PORT:-0}" HTML_ARTIFACT_TOKEN="${TOKEN:-}" nohup node "$DIR/receiver.mjs" >> "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDF"

for _ in $(seq 30); do
  URL="$(grep -oE 'listening on http://127\.0\.0\.1:[0-9]+/\?t=[0-9a-f]+' "$LOG" | tail -1 | sed 's/listening on //')"
  [ -n "$URL" ] && break
  # A pinned port can be taken after a restart; fall back to a fresh ephemeral one.
  if ! kill -0 "$(cat "$PIDF")" 2>/dev/null && [ -n "$PORT" ]; then
    PORT=""; : > "$LOG"
    HTML_ARTIFACT_PORT=0 HTML_ARTIFACT_TOKEN="${TOKEN:-}" nohup node "$DIR/receiver.mjs" >> "$LOG" 2>&1 < /dev/null &
    echo $! > "$PIDF"
  fi
  sleep 0.1
done

if [ -z "${URL:-}" ]; then echo "STATUS=UNAVAILABLE"; cat "$LOG"; exit 0; fi
echo "$URL" > "$URLF"
echo "STATUS=STARTED"; echo "URL=$URL"; echo "LOG=$LOG"
