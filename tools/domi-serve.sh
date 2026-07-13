#!/usr/bin/env bash
# tools/domi-serve.sh — start/stop/status wrapper around the domi-server binary.
#
# Subcommands: start | stop | status | restart
#
# Writes:
#   .domi/server.url  — full URL the binary is serving on
#   .domi/server.pid  — PID of the running domi-server
#   .domi/server.log  — captured stdout/stderr
#
# Both metadata files are removed by `stop`. All three are gitignored.
#
# The server is launched with --port 0 (ephemeral) so it never collides with
# other processes. The bound URL is parsed from the binary's startup log
# (specifically, the `bound_url=...` field emitted by tracing::info!).
#
# This script does NOT compile the binary. If the binary is missing, it exits
# non-zero with a hint to run `cargo build --release -p domi-server`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DOMI_DIR="$REPO_ROOT/.domi"
URL_FILE="$DOMI_DIR/server.url"
PID_FILE="$DOMI_DIR/server.pid"
LOG_FILE="$DOMI_DIR/server.log"

RELEASE_BIN="$REPO_ROOT/target/release/domi-server"
DEBUG_BIN="$REPO_ROOT/target/debug/domi-server"

usage() {
  cat <<'EOF'
Usage: tools/domi-serve.sh <start|stop|status|restart>

start   Launch domi-server on an ephemeral port. Writes .domi/server.url.
stop    Send SIGTERM to the running domi-server (waits 5s, then SIGKILL).
        Removes .domi/server.url and .domi/server.pid.
status  Print whether domi-server is running and where.
restart stop then start.
EOF
}

resolve_binary() {
  if [[ -x "$RELEASE_BIN" ]]; then
    echo "$RELEASE_BIN"
  elif [[ -x "$DEBUG_BIN" ]]; then
    echo "$DEBUG_BIN"
  else
    echo ""
  fi
}

is_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

cmd_start() {
  mkdir -p "$DOMI_DIR"

  if [[ -f "$PID_FILE" ]]; then
    local existing
    existing="$(cat "$PID_FILE" 2>/dev/null || true)"
    if is_alive "$existing"; then
      echo "already running, use 'status' or 'stop'" >&2
      exit 2
    fi
    rm -f "$PID_FILE" "$URL_FILE"
  fi

  local bin
  bin="$(resolve_binary)"
  if [[ -z "$bin" ]]; then
    echo "binary not found. Run once:" >&2
    echo "  cargo build --release -p domi-server" >&2
    exit 1
  fi

  # Launch detached: survives this script exiting; logs go to .domi/server.log.
  # stdin must be redirected from /dev/null too, otherwise Node's child_process
  # stdio pipe stays open and the parent's execFile waits for the grandchild.
  : > "$LOG_FILE"
  nohup "$bin" --port 0 --host 127.0.0.1 \
    --root "$DOMI_DIR/output" --state "$DOMI_DIR/state" \
    </dev/null >>"$LOG_FILE" 2>&1 &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  echo "$pid" > "$PID_FILE"

  # Poll the log for the bound_url=... line emitted by tracing::info!.
  # tracing_subscriber emits ANSI color codes around structured-field names,
  # so strip them before grepping.
  local url=""
  for _ in $(seq 1 50); do
    local stripped
    stripped="$(sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g' "$LOG_FILE" 2>/dev/null || true)"
    if [[ -n "$stripped" ]]; then
      url="$(printf '%s\n' "$stripped" | grep -Eo 'bound_url=http://[^ ]+' | head -1 || true)"
    fi
    if [[ -n "$url" ]]; then
      if [[ -n "$url" ]]; then
        url="${url#bound_url=}"
        echo "$url" > "$URL_FILE"
        echo "$url"
        exit 0
      fi
    fi
    sleep 0.1
  done

  # Timed out. Kill the orphan and report.
  kill "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "launch failed, see $LOG_FILE" >&2
  exit 3
}

cmd_stop() {
  if [[ ! -f "$PID_FILE" ]]; then
    echo "not running" >&2
    exit 1
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  if is_alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 50); do
      is_alive "$pid" || break
      sleep 0.1
    done
    if is_alive "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE" "$URL_FILE"
  echo "stopped"
}

cmd_status() {
  if [[ ! -f "$PID_FILE" ]]; then
    echo "not running"
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  if is_alive "$pid"; then
    local url
    url="$(cat "$URL_FILE" 2>/dev/null || echo '<unknown>')"
    echo "running at $url"
  else
    echo "stale PID file, run 'stop' to clean"
  fi
}

cmd_restart() {
  cmd_stop || true
  cmd_start
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  restart) cmd_restart ;;
  *)       usage; exit 64 ;;
esac