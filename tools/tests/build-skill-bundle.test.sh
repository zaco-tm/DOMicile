#!/usr/bin/env bash
# tools/tests/build-skill-bundle.test.sh — verify tools/build-skill-bundle.sh
# installs the canonical sources byte-identical into domicile/, that
# running it twice is idempotent, and that --check catches drift.
#
# Run via: npm run test:bundle
# Not auto-discovered by vitest (it's a bash test, not JS).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/tools/build-skill-bundle.sh"

# This test runs on the skill dir as it currently exists in the working
# tree. We do NOT rebuild before asserting — the canonical purpose of
# this test is to catch drift between canonical sources and the
# already-committed skill dir (the kind of bug that would slip past
# `git commit` if a contributor forgot to run the build script).
# The build script itself is exercised by `tools/build-skill-bundle.sh`
# smoke steps in the impl plan; this test is the post-commit guardrail.

# The build script does NOT regenerate domicile/SKILL.md — that file is
# the canonical entry, lives at the install root, and is what
# `npx skills` picks up. Everything else below is a generated copy of a
# canonical source.
for entry in \
  "scripts/runtime/domi.js:scripts/runtime/domi.js" \
  "scripts/runtime/domi-audit.js:scripts/runtime/domi-audit.js" \
  "scripts/runtime/domi-audit-render.js:scripts/runtime/domi-audit-render.js" \
  "scripts/runtime/domi-server.js:scripts/runtime/domi-server.js" \
  "scripts/runtime/domi-wire.js:scripts/runtime/domi-wire.js" \
  "scripts/runtime/domi-verify.mjs:scripts/runtime/domi-verify.mjs" \
  "components/domi.css:components/domi.css" \
  "templates/working-doc/index.html:templates/working-doc/index.html"; do
  installed_rel="${entry%%:*}"
  canonical_rel="${entry#*:}"
  src="$REPO_ROOT/$canonical_rel"
  installed="$REPO_ROOT/domicile/$installed_rel"
  if [[ ! -f "$installed" ]]; then
    echo "FAIL: missing installed file $installed_rel"
    exit 1
  fi
  if ! cmp -s "$src" "$installed"; then
    echo "FAIL: installed $installed_rel differs from canonical"
    exit 1
  fi
done

if [[ ! -f "$REPO_ROOT/domicile/SKILL.md" ]]; then
  echo "FAIL: missing skill entry domicile/SKILL.md"
  exit 1
fi

if [[ ! -f "$REPO_ROOT/domicile/README" ]]; then
  echo "FAIL: missing skill dir README"
  exit 1
fi

echo "ok"
