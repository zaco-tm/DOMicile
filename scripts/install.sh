#!/bin/sh
# DOMiNice installer — builds domi-server + domi from source.
# Usage: ./scripts/install.sh [--prefix <dir>] [--dry-run] [--no-verify]
set -eu

PREFIX="${HOME}/.local"
DRY_RUN=0
NO_VERIFY=0

while [ $# -gt 0 ]; do
    case "$1" in
        --prefix)   PREFIX="$2"; shift 2 ;;
        --dry-run)  DRY_RUN=1; shift ;;
        --no-verify) NO_VERIFY=1; shift ;;
        -h|--help)
            sed -n '2,4p' "$0"; exit 0 ;;
        *) echo "unknown flag: $1" >&2; exit 1 ;;
    esac
done

OS=$(uname -s)
case "$OS" in
    Darwin|Linux|FreeBSD) ;;
    *) echo "unsupported OS: $OS (need macOS, Linux, or BSD)" >&2; exit 1 ;;
esac

command -v cargo >/dev/null 2>&1 || { echo "cargo not found. Install rustup: https://rustup.rs" >&2; exit 1; }
command -v rustc >/dev/null 2>&1 || { echo "rustc not found. Install rustup: https://rustup.rs" >&2; exit 1; }

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

echo "==> Building domi-server + domi (release)"
if [ "$DRY_RUN" = 0 ]; then
    cargo build --release -p domi-server || { echo "build failed" >&2; exit 2; }
fi

DEST="${PREFIX}/bin"
if [ "$DRY_RUN" = 0 ]; then
    mkdir -p "$DEST"
    cp -f "target/release/domi-server" "$DEST/domi-server"
    cp -f "target/release/domi"        "$DEST/domi"
    chmod +x "$DEST/domi-server" "$DEST/domi"
fi

echo "==> Installed:"
echo "    $DEST/domi-server"
echo "    $DEST/domi"
case ":$PATH:" in
    *":$DEST:"*) ;;
    *) echo "==> Add to PATH:  export PATH=\"$DEST:\$PATH\"" ;;
esac

# Verify step: only invoke scripts/verify.sh if it's the Phase 2d verifier
# (detected by accepting a --prefix flag). The pre-existing scripts/verify.sh
# is a Phase 1 stub that runs `npm test` and does not accept --prefix — Task 7
# will replace it. Until then, the grep skips the call instead of invoking the
# stub. After Task 7 lands, drop the grep guard and the line becomes a plain
# `if [ "$NO_VERIFY" = 0 ] && [ "$DRY_RUN" = 0 ]; then ...`.
if [ "$NO_VERIFY" = 0 ] && [ "$DRY_RUN" = 0 ] && grep -q -- '--prefix' "$ROOT_DIR/scripts/verify.sh" 2>/dev/null; then
    echo "==> Verifying install"
    "$ROOT_DIR/scripts/verify.sh" --prefix "$PREFIX" || { echo "verify failed" >&2; exit 3; }
fi

echo "==> Done."
