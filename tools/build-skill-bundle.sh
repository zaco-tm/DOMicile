#!/usr/bin/env bash
# tools/build-skill-bundle.sh — populate the Agent Skills install dir
# (domicile/) from the canonical sources in this repo.
#
# After this script runs, `domicile/` is a self-contained Agent Skills
# bundle: SKILL.md at the root, runtime JS under scripts/runtime/, the
# design-system CSS at components/domi.css, the studio frame CSS at
# components/studio.css, and the working-doc starters at both
# templates/working-doc/index.html (the body) and
# templates/working-doc-chrome/ (the chrome that loads the body in an
# iframe via the studio-frame bridge at scripts/runtime/domi-frame-bridge.js).
# The `npx skills add zaco-tm/DOMicile` flow (and the manual
# `cp -R domicile <target>` install) copies this whole directory verbatim
# into the agent's skills dir, so the SKILL.md's relative paths resolve.
#
# Subcommands:
#   (none)   Build: copy each canonical source into the skill dir.
#   --check  Verify the skill dir is in sync. Exits 0 if all bundled
#            files match their canonical sources; exits 1 with one diff
#            message per mismatch otherwise.
#
# Run after editing any canonical source (see INSTALL.md §"Full bundle"
# for the canonical source list). Idempotent.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="$REPO_ROOT/domicile"

# The file mapping: skill-dir-relative path -> canonical repo-relative path.
# Edited in one place for easy maintenance. SKILL.md itself lives at
# domicile/SKILL.md as the canonical entry; the build script does not
# touch it (the canonical source IS the install-root source).
SOURCES=(
  "scripts/runtime/domi.js:$REPO_ROOT/scripts/runtime/domi.js"
  "scripts/runtime/domi-audit.js:$REPO_ROOT/scripts/runtime/domi-audit.js"
  "scripts/runtime/domi-audit-render.js:$REPO_ROOT/scripts/runtime/domi-audit-render.js"
  "scripts/runtime/domi-server.js:$REPO_ROOT/scripts/runtime/domi-server.js"
  "scripts/runtime/domi-wire.js:$REPO_ROOT/scripts/runtime/domi-wire.js"
  "scripts/runtime/domi-frame-bridge.js:$REPO_ROOT/scripts/runtime/domi-frame-bridge.js"
  "scripts/runtime/domi-verify.mjs:$REPO_ROOT/scripts/runtime/domi-verify.mjs"
  "components/domi.css:$REPO_ROOT/components/domi.css"
  "components/studio.css:$REPO_ROOT/components/studio.css"
  "templates/working-doc/index.html:$REPO_ROOT/templates/working-doc/index.html"
  "templates/working-doc-chrome/index.html:$REPO_ROOT/templates/working-doc-chrome/index.html"
  "templates/working-doc-chrome/README.md:$REPO_ROOT/templates/working-doc-chrome/README.md"
  "templates/working-doc-chrome/AGENTS.md:$REPO_ROOT/templates/working-doc-chrome/AGENTS.md"
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

# --check mode: verify each installed file matches its canonical source.
if [[ "${1:-}" == "--check" ]]; then
  drift=0
  for entry in "${SOURCES[@]}"; do
    rel="${entry%%:*}"
    src="${entry#*:}"
    installed="$DST/$rel"
    if [[ ! -f "$installed" ]]; then
      echo "skill dir missing: $rel"
      drift=$((drift + 1))
      continue
    fi
    if ! cmp -s "$src" "$installed"; then
      echo "skill dir out of sync: $rel"
      drift=$((drift + 1))
    fi
  done
  if [[ "$drift" -gt 0 ]]; then
    echo "$drift skill-dir drift(s); rebuild with tools/build-skill-bundle.sh" >&2
    exit 1
  fi
  exit 0
fi

# Build mode: ensure the skill dir subdirs exist.
mkdir -p "$DST/scripts/runtime" "$DST/components" "$DST/templates/working-doc" "$DST/templates/working-doc-chrome"

# Copy each canonical source into the skill dir. Each line is a verbatim
# `cp`; the installed copy holds the same bytes as the canonical source.
cp "$REPO_ROOT/scripts/runtime/domi.js"                "$DST/scripts/runtime/domi.js"
cp "$REPO_ROOT/scripts/runtime/domi-audit.js"           "$DST/scripts/runtime/domi-audit.js"
cp "$REPO_ROOT/scripts/runtime/domi-audit-render.js"    "$DST/scripts/runtime/domi-audit-render.js"
cp "$REPO_ROOT/scripts/runtime/domi-server.js"          "$DST/scripts/runtime/domi-server.js"
cp "$REPO_ROOT/scripts/runtime/domi-wire.js"            "$DST/scripts/runtime/domi-wire.js"
cp "$REPO_ROOT/scripts/runtime/domi-frame-bridge.js"    "$DST/scripts/runtime/domi-frame-bridge.js"
cp "$REPO_ROOT/scripts/runtime/domi-verify.mjs"          "$DST/scripts/runtime/domi-verify.mjs"
cp "$REPO_ROOT/components/domi.css"                     "$DST/components/domi.css"
cp "$REPO_ROOT/components/studio.css"                   "$DST/components/studio.css"
cp "$REPO_ROOT/templates/working-doc/index.html"        "$DST/templates/working-doc/index.html"
cp "$REPO_ROOT/templates/working-doc-chrome/index.html" "$DST/templates/working-doc-chrome/index.html"
cp "$REPO_ROOT/templates/working-doc-chrome/README.md"  "$DST/templates/working-doc-chrome/README.md"
cp "$REPO_ROOT/templates/working-doc-chrome/AGENTS.md"  "$DST/templates/working-doc-chrome/AGENTS.md"

# README banner — written last so the message is "you just generated this".
cat > "$DST/README" <<'EOF'
This directory is a generated Agent Skills install dir. Its bundled files
are produced by `tools/build-skill-bundle.sh` from the canonical sources
in this repo. Do not edit the bundled files here directly — your edits
will be silently overwritten on the next bundle build. To change a
bundled file, edit the canonical source and re-run the build script.
The SKILL.md at the root is the canonical entry; the build script does
not regenerate it.
EOF

echo "skill dir: built (13 files synced into domicile/)"
