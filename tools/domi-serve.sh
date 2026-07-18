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
# Binary resolution (resolve_binary, see below):
#   1. $DOMICILE_BIN_DIR/domi-server (managed; auto-installed by domi-fetch.sh
#      on first start if missing — see DOMICILE_SKIP_AUTO_INSTALL).
#   2. $REPO_ROOT/target/{release,debug}/domi-server (dev builds).
#   3. `command -v domi-server` on PATH.
#
# The server is launched with --port 0 (ephemeral) so it never collides with
# other processes. The bound URL is parsed from the binary's startup log
# (specifically, the `bound_url=...` field emitted by tracing::info!).
#
# This script does NOT compile the binary. If the binary is missing AND
# auto-install fails, it exits non-zero with a hint to run
# `tools/domi-fetch.sh install` or `cargo build --release -p domi-server`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DOMI_DIR="$REPO_ROOT/.domi"
URL_FILE="$DOMI_DIR/server.url"
PID_FILE="$DOMI_DIR/server.pid"
LOG_FILE="$DOMI_DIR/server.log"

RELEASE_BIN="$REPO_ROOT/target/release/domi-server"
DEBUG_BIN="$REPO_ROOT/target/debug/domi-server"

DOMI_SERVER_VERSION="${DOMI_SERVER_VERSION_OVERRIDE:-${DOMI_SERVER_VERSION:-0.1.3}}"
# Bump DOMI_SERVER_VERSION manually on each tag push. The skill ships with
# the version it was tested against; users auto-update on the next skill
# install.

DOMICILE_BIN_DIR="${DOMICILE_BIN_DIR:-$HOME/.local/bin}"
LOCAL_BIN="${DOMICILE_BIN_DIR}/domi-server"

usage() {
  cat <<'EOF'
Usage: tools/domi-serve.sh <start|stop|status|restart>

start   Launch domi-server on an ephemeral port. Writes .domi/server.url.
        Auto-passes --library-root = git rev-parse --show-toplevel (or $PWD).
stop    Send SIGTERM to the running domi-server (waits 5s, then SIGKILL).
        Removes .domi/server.url and .domi/server.pid.
status  Print whether domi-server is running and where.
restart stop then start.
EOF
}

# Returns the absolute path of the domi-server binary to use, or "" if none
# matches the pinned version. Preference order:
#   1. $DOMICILE_BIN_DIR/domi-server (managed install; may be a fresh download)
#   2. $REPO_ROOT/target/release/domi-server (dev build from `cargo build --release`)
#   3. $REPO_ROOT/target/debug/domi-server (dev build from `cargo build`)
#   4. $(command -v domi-server) on PATH (user-installed elsewhere)
# A candidate must exist AND `domi-server --version` must equal $DOMI_SERVER_VERSION
# for steps 1 and 4. Dev builds (steps 2 and 3) skip the version check — they're
# always assumed to be the right version because the dev built them locally.
domi_version_matches() {
  local bin="$1" pin="$2"
  [[ -x "$bin" ]] || return 1
  local v
  v="$("$bin" --version 2>/dev/null | awk '{print $NF}')" || return 1
  [[ "$v" == "$pin" ]]
}

resolve_binary() {
  if domi_version_matches "$LOCAL_BIN" "$DOMI_SERVER_VERSION"; then
    echo "$LOCAL_BIN"; return
  fi
  if [[ -x "$RELEASE_BIN" ]]; then echo "$RELEASE_BIN"; return; fi
  if [[ -x "$DEBUG_BIN" ]];   then echo "$DEBUG_BIN";   return; fi
  local p
  p="$(command -v domi-server 2>/dev/null || true)"
  if [[ -n "$p" ]] && domi_version_matches "$p" "$DOMI_SERVER_VERSION"; then
    echo "$p"; return
  fi
  echo ""
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
    if [[ "${DOMICILE_SKIP_AUTO_INSTALL:-0}" == "1" ]]; then
      echo "domi-server v${DOMI_SERVER_VERSION} not installed. Run:" >&2
      echo "  bash $REPO_ROOT/tools/domi-fetch.sh install" >&2
      echo "or: cargo install domi-server --locked --root \"$HOME/.local\"" >&2
      exit 1
    fi
    echo "[domi-serve] domi-server v${DOMI_SERVER_VERSION} not found — installing..."
    if ! DOMI_SERVER_VERSION="$DOMI_SERVER_VERSION" \
         DOMICILE_BIN_DIR="$DOMICILE_BIN_DIR" \
         bash "$REPO_ROOT/tools/domi-fetch.sh" install; then
      echo "[domi-serve] auto-install failed; see above. Re-run with DOMICILE_SKIP_AUTO_INSTALL=1 to disable." >&2
      exit 1
    fi
    bin="$(resolve_binary)"
    [[ -n "$bin" ]] || { echo "[domi-serve] still no binary after install" >&2; exit 1; }
  fi

  # Launch detached: survives this script exiting; logs go to .domi/server.log.
  # stdin must be redirected from /dev/null too, otherwise Node's child_process
  # stdio pipe stays open and the parent's execFile waits for the grandchild.
  : > "$LOG_FILE"
  # --library-root points the server's library subrouter at the repo's
  # design system so cloned working docs use /components/* and /scripts/*
  # without any agent-side path rewriting. Falls back to PWD in non-git
  # checkouts (e.g. tarball installs); the library routes will then 404,
  # which is harmless.
  local lib_root
  lib_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  nohup "$bin" --port 0 --host 127.0.0.1 \
    --root "$DOMI_DIR/output" --state "$DOMI_DIR/state" \
    --library-root "$lib_root" \
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