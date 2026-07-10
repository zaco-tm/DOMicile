#!/bin/sh
# DOMiNice install verifier — boots domi-server on ephemeral port,
# asserts /healthz, POST /api/events, GET /api/events, /ws/events upgrade.
# Usage: ./scripts/verify.sh [--prefix <dir>] [--timeout <seconds>]
set -eu

PREFIX="${HOME}/.local"
TIMEOUT=10
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

while [ $# -gt 0 ]; do
    case "$1" in
        --prefix)  PREFIX="$2"; shift 2 ;;
        --timeout) TIMEOUT="$2"; shift 2 ;;
        -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
        *) echo "unknown flag: $1" >&2; exit 1 ;;
    esac
done

SERVER_BIN="${PREFIX}/bin/domi-server"
CLI_BIN="${PREFIX}/bin/domi"
WS_PROBE="${SCRIPT_DIR}/ws-probe.mjs"

[ -x "$SERVER_BIN" ] || { echo "missing $SERVER_BIN — run install.sh first" >&2; exit 1; }
[ -x "$CLI_BIN" ]    || { echo "missing $CLI_BIN — run install.sh first"    >&2; exit 1; }
[ -f "$WS_PROBE" ]   || { echo "missing $WS_PROBE" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node not found (needed for ws-probe)" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl not found" >&2; exit 1; }
command -v jq   >/dev/null 2>&1 || { echo "jq not found"   >&2; exit 1; }

# Pick an ephemeral port — bind to 0, query the assigned port via /proc or lsof trick.
# Simpler: pick a high random port and hope nothing's there. Cross-platform enough for 2d.
PORT=$(( 20000 + (RANDOM % 10000) ))
LOG=$(mktemp -t domi-verify.XXXXXX.log)
cleanup() {
    if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
        kill -TERM "$PID" 2>/dev/null || true
        sleep 1
        kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null || true
    fi
    wait "${PID:-0}" 2>/dev/null || true
    rm -f "$LOG"
}
trap cleanup EXIT INT TERM

echo "==> Booting $SERVER_BIN on port $PORT"
"$SERVER_BIN" --port "$PORT" --root /tmp/domi-verify-root --state /tmp/domi-verify-state >"$LOG" 2>&1 &
PID=$!

# Assertion 1: /healthz
echo "==> Assert /healthz"
HEALTHZ_OK=0
i=0
while [ $i -lt "$TIMEOUT" ]; do
    if curl -fsS "http://127.0.0.1:$PORT/healthz" 2>/dev/null | jq -e '.status == "ok"' >/dev/null; then
        HEALTHZ_OK=1; break
    fi
    sleep 1
    i=$((i + 1))
done
[ "$HEALTHZ_OK" = 1 ] || { echo "healthz failed after ${TIMEOUT}s" >&2; cat "$LOG" >&2; exit 2; }
echo "    OK"

# Assertion 2: POST /api/events
echo "==> Assert POST /api/events"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "http://127.0.0.1:$PORT/api/events" \
    -H 'Content-Type: application/json' \
    -d '{"v":2,"id":null,"ts":"2026-07-05T18:21:00Z","src":"domi.js","doc":"synthetic","kind":"click","target":{"id":"button.ok","selector":null,"rect":{"x":0.0,"y":0.0,"w":1.0,"h":1.0}},"data":{}}')
[ "$HTTP_CODE" = "204" ] || { echo "POST expected 204, got $HTTP_CODE" >&2; exit 3; }
echo "    OK (204)"

# Assertion 3: GET /api/events round-trip
echo "==> Assert GET /api/events"
REPLAY_JSON=$("$CLI_BIN" replay --server "http://127.0.0.1:$PORT" --doc synthetic --limit 10)
COUNT=$(echo "$REPLAY_JSON" | jq '.events | length')
[ "$COUNT" -ge 1 ] || { echo "expected >= 1 event, got $COUNT" >&2; echo "$REPLAY_JSON" >&2; exit 4; }
HAS_ID=$(echo "$REPLAY_JSON" | jq -r '.events[0].id')
case "$HAS_ID" in
    01*) echo "    OK (id=$HAS_ID)" ;;
    *)   echo "expected server-stamped ULID id, got $HAS_ID" >&2; exit 4 ;;
esac

# Assertion 4: /ws/events upgrade
echo "==> Assert /ws/events upgrade"
HELLO=$(node "$WS_PROBE" --url "ws://127.0.0.1:$PORT/ws/events" 2>/dev/null) || { echo "ws-probe failed" >&2; exit 5; }
HELLO_TYPE=$(echo "$HELLO" | jq -r '.type')
HELLO_V=$(echo "$HELLO" | jq -r '.v')
[ "$HELLO_TYPE" = "hello" ] && [ "$HELLO_V" = "2" ] || { echo "expected hello v:2, got $HELLO" >&2; exit 5; }
echo "    OK (hello v:$HELLO_V)"

# Cleanup happens via trap
echo "==> All assertions passed."
exit 0
