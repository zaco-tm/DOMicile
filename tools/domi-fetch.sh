#!/usr/bin/env bash
# tools/domi-fetch.sh — auto-install domi-server from GitHub Releases,
# with `cargo install` as fallback. POSIX-sh friendly (uses bash only for
# `[[ ]]` in one place; the rest is sh-portable).
#
# Subcommands:
#   install         Download + verify + install. Idempotent.
#   version         Print pinned version + computed URL.
#   fallback-cargo  Build from source via `cargo install` (last resort).
#
# Environment variables:
#   DOMI_SERVER_VERSION          Pinned version (default: 0.1.0).
#                                Override with DOMI_SERVER_VERSION_OVERRIDE.
#   DOMI_SERVER_VERSION_OVERRIDE If set, replaces DOMI_SERVER_VERSION.
#   DOMICILE_BIN_DIR             Install location (default: $HOME/.local/bin).
#   DOMICILE_SKIP_AUTO_INSTALL   If "1", exit 1 without installing.
#
# Exit codes:
#   0  success / no-op
#   1  hard failure (network down, checksum mismatch, no cargo for fallback)
#   2  triple not supported AND cargo not on PATH

set -eu

# Prefer bash for `[[ ]]`, fall back to sh. Bash is on every supported OS.
if [ -n "${BASH_VERSION:-}" ]; then
  set -o pipefail
fi

DOMI_SERVER_VERSION="${DOMI_SERVER_VERSION_OVERRIDE:-${DOMI_SERVER_VERSION:-0.1.0}}"
DOMICILE_BIN_DIR="${DOMICILE_BIN_DIR:-$HOME/.local/bin}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  sed -n '2,15p' "$0"
  exit 64
}

detect_triple() {
  local arch os
  arch="$(uname -m)"
  os="$(uname -s)"
  case "$os" in
    Darwin)
      case "$arch" in
        x86_64) echo "x86_64-apple-darwin" ;;
        arm64)  echo "aarch64-apple-darwin" ;;
        *)      echo "unsupported"; return 1 ;;
      esac ;;
    Linux)
      case "$arch" in
        x86_64) echo "x86_64-unknown-linux-gnu" ;;
        aarch64) echo "aarch64-unknown-linux-gnu" ;;
        *)      echo "unsupported"; return 1 ;;
      esac ;;
    *)
      echo "unsupported"; return 1 ;;
  esac
}

asset_url() {
  local triple="$1"
  echo "https://github.com/zaco-tm/DOMicile/releases/download/v${DOMI_SERVER_VERSION}/domi-server-${DOMI_SERVER_VERSION}-${triple}.tar.gz"
}

cmd_version() {
  local triple
  triple="$(detect_triple || echo unknown)"
  echo "${DOMI_SERVER_VERSION}"
  asset_url "$triple"
}

cmd_fallback_cargo() {
  if ! command -v cargo >/dev/null 2>&1; then
    echo "[domi-fetch] cargo not on PATH. Install Rust: https://rustup.rs" >&2
    return 1
  fi
  local scratch="${DOMICILE_BIN_DIR}/.cargo-scratch"
  mkdir -p "$scratch"
  CARGO_HOME="$scratch/cargo" \
    cargo install domi-server --locked --root "$scratch" --version "${DOMI_SERVER_VERSION}" || return 1
  mkdir -p "${DOMICILE_BIN_DIR}"
  install -m 0755 "${scratch}/bin/domi-server" "${DOMICILE_BIN_DIR}/domi-server"
  install -m 0755 "${scratch}/bin/domi"        "${DOMICILE_BIN_DIR}/domi"
  rm -rf "$scratch"
  echo "[domi-fetch] installed domi-server v${DOMI_SERVER_VERSION} via cargo to ${DOMICILE_BIN_DIR}/"
}

cmd_install() {
  if [[ "${DOMICILE_SKIP_AUTO_INSTALL:-0}" == "1" ]]; then
    echo "[domi-fetch] DOMICILE_SKIP_AUTO_INSTALL=1, refusing to install" >&2
    return 1
  fi

  # No-op if already installed at the right version.
  if [[ -x "${DOMICILE_BIN_DIR}/domi-server" ]]; then
    local current
    current="$("${DOMICILE_BIN_DIR}/domi-server" --version 2>/dev/null | awk '{print $NF}')"
    if [[ "$current" == "${DOMI_SERVER_VERSION}" ]]; then
      echo "[domi-fetch] domi-server v${DOMI_SERVER_VERSION} already installed"
      return 0
    fi
    if [[ -n "$current" ]] && [[ "$current" > "${DOMI_SERVER_VERSION}" ]]; then
      echo "[domi-fetch] ${DOMICILE_BIN_DIR}/domi-server is v${current} (newer than pin v${DOMI_SERVER_VERSION}). Skipping. Set DOMI_SERVER_VERSION_OVERRIDE=${current} to update the pin."
      return 0
    fi
  fi

  local triple
  if ! triple="$(detect_triple)"; then
    echo "[domi-fetch] unsupported host $(uname -m)-$(uname -s). Falling back to cargo." >&2
    cmd_fallback_cargo
    return $?
  fi

  local url tmpdir
  url="$(asset_url "$triple")"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  if ! curl -fsSL --retry 3 -o "$tmpdir/asset.tar.gz" "$url"; then
    echo "[domi-fetch] could not download $url" >&2
    echo "[domi-fetch] falling back to source build (5-15 minutes)" >&2
    cmd_fallback_cargo
    return $?
  fi

  if ! curl -fsSL -o "$tmpdir/SHA256SUMS" "${url%/domi-server-*}/SHA256SUMS"; then
    echo "[domi-fetch] could not download SHA256SUMS — refusing to install unverified bytes" >&2
    return 1
  fi

  ( cd "$tmpdir" && grep -E "  domi-server-${DOMI_SERVER_VERSION}-${triple}\.tar.gz$" SHA256SUMS \
      | sha256sum -c - ) || { echo "[domi-fetch] checksum verification failed"; return 1; }

  tar -xzf "$tmpdir/asset.tar.gz" -C "$tmpdir/"

  if [[ ! -x "$tmpdir/bin/domi-server" ]] || [[ ! -x "$tmpdir/bin/domi" ]]; then
    echo "[domi-fetch] tarball missing bin/domi-server or bin/domi" >&2
    return 1
  fi

  if ! mkdir -p "${DOMICILE_BIN_DIR}"; then
    echo "[domi-fetch] cannot create ${DOMICILE_BIN_DIR}. Set DOMICILE_BIN_DIR=/somewhere/writable." >&2
    return 1
  fi

  install -m 0755 "$tmpdir/bin/domi-server" "${DOMICILE_BIN_DIR}/domi-server"
  install -m 0755 "$tmpdir/bin/domi"        "${DOMICILE_BIN_DIR}/domi"
  echo "[domi-fetch] installed domi-server v${DOMI_SERVER_VERSION} (${triple}) to ${DOMICILE_BIN_DIR}/"
}

case "${1:-}" in
  install)        cmd_install ;;
  version)        cmd_version ;;
  fallback-cargo) cmd_fallback_cargo ;;
  -h|--help)      usage ;;
  *)              usage ;;
esac