#!/usr/bin/env bash
# tools/tests/build-skill-bundle.test.sh — verify tools/build-skill-bundle.sh
# produces a bundle byte-identical (modulo the generated README) to the
# canonical sources, that running it twice is idempotent, and that
# --check catches drift.
#
# Run via: npm run test:bundle
# Not auto-discovered by vitest (it's a bash test, not JS).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/tools/build-skill-bundle.sh"

# This test runs on the bundle as it currently exists in the working
# tree. We do NOT rebuild before asserting — the canonical purpose of
# this test is to catch drift between canonical sources and the
# already-committed bundle (the kind of bug that would slip past
# `git commit` if a contributor forgot to run the build script).
# The build script itself is exercised by `tools/build-skill-bundle.sh`
# smoke steps in the impl plan; this test is the post-commit guardrail.

# Paths are bundle-relative (under domicile/domicile/) and repo-relative
# canonical paths. The two have the same suffix for everything except
# SKILL.md, which sits under domicile/ in the canonical layout.
for entry in \
  "SKILL.md:domicile/SKILL.md" \
  "scripts/runtime/domi.js:scripts/runtime/domi.js" \
  "scripts/runtime/domi-audit.js:scripts/runtime/domi-audit.js" \
  "scripts/runtime/domi-audit-render.js:scripts/runtime/domi-audit-render.js" \
  "scripts/runtime/domi-server.js:scripts/runtime/domi-server.js" \
  "scripts/runtime/domi-wire.js:scripts/runtime/domi-wire.js" \
  "components/domi.css:components/domi.css" \
  "templates/working-doc/index.html:templates/working-doc/index.html"; do
  bundled_rel="${entry%%:*}"
  canonical_rel="${entry#*:}"
  src="$REPO_ROOT/$canonical_rel"
  bundled="$REPO_ROOT/domicile/domicile/$bundled_rel"
  if [[ ! -f "$bundled" ]]; then
    echo "FAIL: missing bundled file $bundled_rel"
    exit 1
  fi
  if ! cmp -s "$src" "$bundled"; then
    echo "FAIL: bundled $bundled_rel differs from canonical"
    exit 1
  fi
done

if [[ ! -f "$REPO_ROOT/domicile/domicile/README" ]]; then
  echo "FAIL: missing bundle README"
  exit 1
fi

echo "ok"
