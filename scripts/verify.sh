#!/usr/bin/env bash
# DOMiNice verifier — runs all tests + smoke check.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ test"
npm test

echo "→ smoke (dashboard.html renders in jsdom)"
npm run smoke

echo ""
echo "✓ DOMiNice v0.1.0 verified"
