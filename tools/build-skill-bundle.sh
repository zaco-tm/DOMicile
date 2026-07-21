#!/usr/bin/env bash
# tools/build-skill-bundle.sh — generate the Agent Skills bundle under
# domicile/domicile/ from the canonical sources in this repo.
#
# Subcommands:
#   (none)   Build: copy each canonical source into the bundle.
#   --check  Verify the bundle is in sync. Exits 0 if all 7 bundled files
#            match their canonical sources; exits 1 with one diff message
#            per mismatch otherwise.
#
# Run after editing any canonical source (see INSTALL.md §"Full bundle"
# for the canonical source list). Idempotent.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_SKILL="$REPO_ROOT/domicile/SKILL.md"
DST="$REPO_ROOT/domicile/domicile"

# The file mapping: relative path -> canonical relative path.
# Edited in one place for easy maintenance.
SOURCES=(
  "SKILL.md:$REPO_ROOT/domicile/SKILL.md"
  "scripts/runtime/domi.js:$REPO_ROOT/scripts/runtime/domi.js"
  "scripts/runtime/domi-audit.js:$REPO_ROOT/scripts/runtime/domi-audit.js"
  "scripts/runtime/domi-audit-render.js:$REPO_ROOT/scripts/runtime/domi-audit-render.js"
  "scripts/runtime/domi-server.js:$REPO_ROOT/scripts/runtime/domi-server.js"
  "scripts/runtime/domi-wire.js:$REPO_ROOT/scripts/runtime/domi-wire.js"
  "components/domi.css:$REPO_ROOT/components/domi.css"
  "templates/working-doc/index.html:$REPO_ROOT/templates/working-doc/index.html"
)

# Sanity-check all canonical sources exist (does not run under --check).
if [[ "${1:-}" != "--check" ]]; then
  missing=0
  for entry in "${SOURCES[@]}"; do
    src="${entry#*:}"
    if [[ ! -f "$src" ]]; then
      echo "missing canonical source: ${src#$REPO_ROOT/}" >&2
      missing=$((missing + 1))
    fi
  done
  if [[ "$missing" -gt 0 ]]; then
    echo "$missing canonical source(s) missing — bundle build aborted" >&2
    exit 2
  fi
fi

# --check mode: verify each bundled file matches its canonical source.
if [[ "${1:-}" == "--check" ]]; then
  drift=0
  for entry in "${SOURCES[@]}"; do
    rel="${entry%%:*}"
    src="${entry#*:}"
    bundled="$DST/$rel"
    if [[ ! -f "$bundled" ]]; then
      echo "bundle missing: $rel"
      drift=$((drift + 1))
      continue
    fi
    if ! cmp -s "$src" "$bundled"; then
      echo "bundle out of sync: $rel"
      drift=$((drift + 1))
    fi
  done
  if [[ "$drift" -gt 0 ]]; then
    echo "$drift bundle drift(s); rebuild with tools/build-skill-bundle.sh" >&2
    exit 1
  fi
  exit 0
fi

# Build mode: ensure the bundle directory structure exists.
mkdir -p "$DST/scripts/runtime" "$DST/components" "$DST/templates/working-doc"

# Copy each canonical source into the bundle. Each line is a verbatim
# `cp`; the bundle holds the same bytes as the canonical source.
cp "$REPO_ROOT/domicile/SKILL.md"                        "$DST/SKILL.md"
cp "$REPO_ROOT/scripts/runtime/domi.js"                "$DST/scripts/runtime/domi.js"
cp "$REPO_ROOT/scripts/runtime/domi-audit.js"           "$DST/scripts/runtime/domi-audit.js"
cp "$REPO_ROOT/scripts/runtime/domi-audit-render.js"    "$DST/scripts/runtime/domi-audit-render.js"
cp "$REPO_ROOT/scripts/runtime/domi-server.js"          "$DST/scripts/runtime/domi-server.js"
cp "$REPO_ROOT/scripts/runtime/domi-wire.js"            "$DST/scripts/runtime/domi-wire.js"
cp "$REPO_ROOT/components/domi.css"                     "$DST/components/domi.css"
cp "$REPO_ROOT/templates/working-doc/index.html"        "$DST/templates/working-doc/index.html"

# README banner — written last so the message is "you just generated this".
cat > "$DST/README" <<'EOF'
This directory is a generated Agent Skills bundle. Its contents are produced
by `tools/build-skill-bundle.sh` from the canonical sources in this repo. Do
not edit files here directly — your edits will be silently overwritten on the
next bundle build. To change a bundled file, edit the canonical source and
re-run the build script.
EOF

echo "bundle: built (8 files copied)"
