#!/bin/sh
# Companion to scripts/verify-skill-loop.sh — drives the skill loop against
# the real Rust domi-server binary. Asserts the server shim is injected,
# the audit rail mounts in server mode, and a comment lands in /api/events.
# Usage: ./scripts/verify-skill-loop-server.sh
# Exits non-zero on any failed check.
set -eu

cd "$(dirname "$0")/.."

command -v node >/dev/null 2>&1 || { echo "node not found" >&2; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "cargo not found" >&2; exit 1; }

# Build the binary if it's missing or stale relative to source.
if [ ! -x target/release/domi-server ] || [ -n "$(find crates/domi-server/src -name '*.rs' -newer target/release/domi-server 2>/dev/null | head -1)" ]; then
  echo "==> Building domi-server (release)"
  cargo build --release -p domi-server
fi

echo "==> Running skill-loop server-mode e2e verifier"
PORT="${PORT:-4173}" node tools/skill-smoke-server-test.mjs
