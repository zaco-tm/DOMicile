#!/bin/sh
# Companion to scripts/verify.sh — boots skill-smoke via Playwright in a real
# browser, asserts the audit rail renders + a comment persists through reload.
# Usage: ./scripts/verify-skill-loop.sh
# Exits non-zero on any failed check.
set -eu

cd "$(dirname "$0")/.."

command -v node >/dev/null 2>&1 || { echo "node not found" >&2; exit 1; }

echo "==> Running skill-loop e2e verifier"
PORT="${PORT:-8123}" node tools/skill-smoke-test.mjs
