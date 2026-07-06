# Phase 2d — Agent Tooling Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-05-phase2d-agent-tooling-design.md` (Draft v1)
**Date:** 2026-07-05
**Phase:** 2d (last sub-project of Phase 2)

## Decisions (locked from spec)

- **Q1 CLI language** — Rust second-binary inside `crates/domi-server` (`[[bin]] name = "domi"`). Reuses clap from 2c-γ; one `cargo build --release` produces `domi-server` + `domi`.
- **Q2 `Cargo.lock`** — **keep gitignored**. `install.sh` does a fresh `cargo build --release` (no `--locked`). Pragmatic for 2d; revisit when distribution story lands.
- **Q3 install/verify location** — **`scripts/`** (matches existing `scripts/domi.js` convention). New files: `scripts/install.sh`, `scripts/verify.sh`, `scripts/ws-probe.mjs`.

If Q1/Q2/Q3 are wrong, stop after Task 1 and re-plan.

## Global Constraints

- **Library invariant held.** `tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/` are untouched. `crates/domi-server/src/{events,serve,http}/` from 2c-α/β/γ are also untouched — 2d is purely additive.
- **TDD.** Tests written before implementation. Tests fail (red), then code passes (green), then refactor.
- **Cross-language drift.** `tools/` shares the wire-protocol JSON shapes with `domi.js` server mode (2b) and the binary (2c-γ). If a shape changes, `tests/wire-protocol.test.js` is the source of truth — update all three.
- **`--port 0` semantics.** 2c-γ's `args.rs` validates `--port` with `value_parser = clap::value_parser!(u16).range(1..)` which **rejects 0**. Task 1 must lift the lower bound to `0..=65535` so `verify.sh` can ask the kernel for an ephemeral port. This is the only existing-code change in 2d.
- **Tests gated.** `#[ignore]` on any test that spawns the binary or opens a real port. Default `cargo test` stays hermetic.
- **POSIX-portable shell.** `/bin/sh` only — no `[[ ]]`, no `declare -A`, no bash-isms. Tested on macOS `/bin/sh` and Linux dash.
- **Permissively licensed deps only.** `reqwest` (MIT/Apache-2.0), `tokio-tungstenite` (MIT), `ulid` (MIT), `futures-util` (MIT/Apache-2.0) — all clear.
- **AGENTS.md conventions** apply: `rtk` for fs/git/grep, `npm test` (JS) + `cargo test --workspace` (Rust) both stay green at every commit.

## Task 1: Manifest + scaffold + lift `--port` lower bound

**Files touched:** `crates/domi-server/Cargo.toml`, `crates/domi-server/src/lib.rs`, `crates/domi-server/src/main.rs` (no edit), `crates/domi-server/src/http/args.rs` (one-line fix), `crates/domi-server/src/tools/mod.rs` (new).

### 1.1 Lift `--port` lower bound

`crates/domi-server/src/http/args.rs` currently rejects `--port 0`. Change `value_parser!(u16).range(1..)` → `value_parser!(u16).range(0..=65535)`. Existing `args` tests must still pass; add a new test `port_zero_accepted` that asserts `--port 0` parses without error and stores `0`.

### 1.2 Add `domi` binary + `tools` module to `Cargo.toml`

```toml
[[bin]]
name = "domi-server"
path = "src/main.rs"

[[bin]]
name = "domi"            # NEW
path = "src/tools/main.rs"

[dependencies]
# ... existing ...
reqwest        = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
tokio-tungstenite = { version = "0.24", default-features = false, features = ["connect", "rustls-tls-webpki-roots"] }
ulid           = { version = "1", features = ["serde"] }
futures-util   = "0.3"
clap           = { version = "4", features = ["derive"] }  # already present
```

### 1.3 Scaffold `crates/domi-server/src/tools/`

```
crates/domi-server/src/tools/
  mod.rs       # pub mod cli; pub mod push; pub mod replay; pub mod tail;
  main.rs      # #[tokio::main] async fn main() -> ... { domi_server::tools::cli::run().await }
  cli.rs       # clap derive — Subcommand enum with Tail/Replay/Push variants
  push.rs      # stub: async fn run(args: PushArgs, server: &Url) -> Result<()>
  replay.rs    # stub: async fn run(args: ReplayArgs, server: &Url) -> Result<Vec<Event>>
  tail.rs      # stub: async fn run(args: TailArgs, server: &Url) -> Result<()>
  types.rs     # shared: Url parsing, default-server constant
```

`mod.rs` re-exports `pub use cli::run;`. `cli::run()` parses `Cli` from `std::env::args()`, dispatches to the right subcommand, propagates exit codes.

### 1.4 Update `lib.rs`

Add `pub mod tools;`.

### Acceptance for Task 1

- `cargo build --workspace` produces both `target/debug/domi-server` and `target/debug/domi`.
- `cargo test -p domi-server --bin domi-server` (all existing 2c-γ tests) still green.
- New `port_zero_accepted` test passes.
- `target/debug/domi --help` prints a clap-formatted help screen with `tail`, `replay`, `push` subcommands listed.
- `target/debug/domi tail --help`, `replay --help`, `push --help` each print per-subcommand help.

## Task 2: `tools/types.rs` + `tools/cli.rs` — shared types + clap derive

**TDD-first:**

1. Write `crates/domi-server/tests/tools_cli_help.rs`:
   - `cli_help_lists_subcommands` — runs `domi --help`, asserts "tail", "replay", "push" appear.
   - `cli_tail_help_lists_follow` — runs `domi tail --help`, asserts `--follow`, `--limit`, `--doc`, `--server` appear.
   - `cli_push_help_requires_type` — runs `domi push --help`, asserts `--type <TYPE>` shows `<TYPE>` as required.
   - `cli_replay_help_lists_since` — runs `domi replay --help`, asserts `--since <ULID>`, `--doc`, `--limit`, `--server` appear.
2. Implement `cli.rs`:

```rust
#[derive(Parser, Debug)]
#[command(name = "domi", about = "DOMiNice agent-side tooling")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Sub,
}

#[derive(Subcommand, Debug)]
pub enum Sub {
    Tail(TailArgs),
    Replay(ReplayArgs),
    Push(PushArgs),
}

#[derive(Args, Debug)]
pub struct TailArgs {
    #[arg(long, default_value = "http://127.0.0.1:4173")]
    pub server: String,
    #[arg(long, default_value_t = true)]
    pub follow: bool,
    #[arg(long, default_value_t = 100)]
    pub limit: usize,
    #[arg(long)]
    pub doc: Option<String>,
}

#[derive(Args, Debug)]
pub struct ReplayArgs {
    #[arg(long, default_value = "http://127.0.0.1:4173")]
    pub server: String,
    #[arg(long)]
    pub since: Option<String>,
    #[arg(long)]
    pub doc: Option<String>,
    #[arg(long, default_value_t = 100)]
    pub limit: usize,
}

#[derive(Args, Debug)]
pub struct PushArgs {
    #[arg(long, default_value = "http://127.0.0.1:4173")]
    pub server: String,
    #[arg(long)]
    pub r#type: String,
    #[arg(long)]
    pub doc: Option<String>,
    #[arg(long)]
    pub target: Option<String>,
    #[arg(long)]
    pub json: Option<String>,
}
```

Note `r#type` because `type` is a Rust keyword. The CLI flag stays `--type` (clap handles it).

3. `types.rs`:

```rust
pub const DEFAULT_SERVER: &str = "http://127.0.0.1:4173";

pub fn parse_server(s: &str) -> Result<reqwest::Url, String> {
    s.parse::<reqwest::Url>().map_err(|e| e.to_string())
}
```

4. `mod.rs`:

```rust
pub mod cli;
pub mod push;
pub mod replay;
pub mod tail;
pub mod types;

pub async fn run() -> i32 {
    use clap::Parser;
    let cli = cli::Cli::parse();
    let server = match types::parse_server(match &cli.command {
        cli::Sub::Tail(a) => &a.server,
        cli::Sub::Replay(a) => &a.server,
        cli::Sub::Push(a) => &a.server,
    }) {
        Ok(u) => u,
        Err(e) => { eprintln!("invalid --server: {e}"); return 1; }
    };
    match cli.command {
        cli::Sub::Tail(a)   => tail::run(a, &server).await,
        cli::Sub::Replay(a) => replay::run(a, &server).await,
        cli::Sub::Push(a)   => push::run(a, &server).await,
    }
}
```

### Acceptance for Task 2

- All 4 tests in `tools_cli_help.rs` pass.
- `cargo run -p domi-server --bin domi -- --help` prints subcommand list.

## Task 3: `tools/push.rs` — simplest subcommand (TDD)

**Test-first:** `crates/domi-server/src/tools/push.rs` has no internal tests (it's an integration-only subcommand). The test surface is `crates/domi-server/tests/tools_push_smoke.rs`:

1. `push_204_returns_zero` — boots a real binary via `domi_server::http::run` in a `tokio::spawn`, picks ephemeral port, runs `domi push --server http://127.0.0.1:<port> --type click --doc synthetic`, asserts exit 0 and stdout empty (server returns 204).
2. `push_bad_type_returns_two` — sends `--type bogus`, asserts exit 2 (server returns 400 schema error).
3. `push_unreachable_returns_one` — sends to a port nothing's listening on, asserts exit 1 within 2s.
4. `push_json_override` — sends `--json '{"v":2,"id":null,"ts":null,"type":"click","doc":"synthetic","target":"button.ok","payload":{}}'`, asserts exit 0.

Gated behind `#[ignore]` (boots a real port).

### Implementation

```rust
use crate::tools::cli::PushArgs;
use crate::tools::types::DEFAULT_SERVER;
use reqwest::Client;
use serde_json::{json, Value};

pub async fn run(args: PushArgs, server: &reqwest::Url) -> i32 {
    let body: Value = match args.json {
        Some(raw) => match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(e) => { eprintln!("invalid --json: {e}"); return 2; }
        },
        None => json!({
            "v": 2, "id": null, "ts": null,
            "type": args.r#type,
            "doc": args.doc.unwrap_or_else(|| "synthetic".into()),
            "target": args.target.unwrap_or_default(),
            "payload": {}
        }),
    };

    let client = match Client::builder().timeout(std::time::Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(e) => { eprintln!("client init: {e}"); return 1; }
    };

    let url = server.join("/api/events").expect("server URL has /api/events joinable");
    match client.post(url).json(&body).send().await {
        Ok(resp) if resp.status().is_success() => 0,
        Ok(resp) => { eprintln!("server returned {}", resp.status()); 2 }
        Err(e) => { eprintln!("request failed: {e}"); 1 }
    }
}
```

### Acceptance for Task 3

- All 4 tests in `tools_push_smoke.rs` pass with `cargo test -- --ignored`.
- Default `cargo test` stays green.

## Task 4: `tools/replay.rs` — GET /api/events (TDD)

**Tests** in `crates/domi-server/tests/tools_replay_smoke.rs`:

1. `replay_empty_returns_zero_with_empty_array` — boots binary, no events posted, `domi replay` exits 0 with stdout `{"events":[],"nextSince":"01H..."}`.
2. `replay_round_trips_one_event` — POSTs a synthetic click via `domi push`, then `domi replay` and asserts the printed JSON contains that event with a non-null `id`.
3. `replay_with_doc_filter_excludes_other_docs` — POSTs two events with different `--doc`, `domi replay --doc foo` shows only the matching one.
4. `replay_unreachable_returns_one`.

### Implementation

```rust
use crate::tools::cli::ReplayArgs;
use reqwest::Client;

pub async fn run(args: ReplayArgs, server: &reqwest::Url) -> i32 {
    let client = match Client::builder().timeout(std::time::Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(e) => { eprintln!("client init: {e}"); return 1; }
    };
    let mut url = server.join("/api/events").expect("server URL has /api/events joinable");
    {
        let mut qp = url.query_pairs_mut();
        if let Some(s) = &args.since { qp.append_pair("since", s); }
        if let Some(d) = &args.doc { qp.append_pair("doc", d); }
        qp.append_pair("limit", &args.limit.to_string());
    }
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => {
            match resp.text().await {
                Ok(body) => { print!("{body}"); 0 }
                Err(e) => { eprintln!("read body: {e}"); 1 }
            }
        }
        Ok(resp) => { eprintln!("server returned {}", resp.status()); 2 }
        Err(e) => { eprintln!("request failed: {e}"); 1 }
    }
}
```

### Acceptance for Task 4

- All 4 tests in `tools_replay_smoke.rs` pass with `cargo test -- --ignored`.

## Task 5: `tools/tail.rs` — WS + replay loop (TDD)

**Tests** in `crates/domi-server/tests/tools_tail_smoke.rs`:

1. `tail_emits_initial_replay_then_live_events` — POSTs one synthetic event before tail starts; runs `domi tail --limit 10` as a child process; reads first stdout line within 2s; posts a second event while tail is running; reads second stdout line within 1s; sends SIGTERM, child exits 0.
2. `tail_doc_filter_excludes_other_docs` — POSTs events with two different `--doc`, runs `domi tail --doc foo`, asserts only `foo` events appear on stdout.
3. `tail_unreachable_returns_one` — port nothing's listening on, exits 1 within 2s.

The first test is the meatiest — needs child-process management (`std::process::Command`, pipe stdout, signal the child on a timeout). Use `nix` crate's `kill` or just `libc::kill` via FFI — or, since macOS + Linux both support `nix`, add it as a `dev-dependency`.

```toml
[dev-dependencies]
nix = { version = "0.29", features = ["signal"] }
```

### Implementation

```rust
use crate::tools::cli::TailArgs;
use crate::tools::types::DEFAULT_SERVER;
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

pub async fn run(args: TailArgs, server: &reqwest::Url) -> i32 {
    // 1. Initial replay via GET /api/events
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(e) => { eprintln!("client init: {e}"); return 1; }
    };
    let mut url = server.join("/api/events").expect("server URL has /api/events joinable");
    {
        let mut qp = url.query_pairs_mut();
        qp.append_pair("limit", &args.limit.to_string());
        if let Some(d) = &args.doc { qp.append_pair("doc", d); }
    }
    let initial = match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => match r.json::<serde_json::Value>().await {
            Ok(v) => v,
            Err(e) => { eprintln!("replay parse: {e}"); return 1; }
        },
        Ok(r) => { eprintln!("replay returned {}", r.status()); return 2; }
        Err(e) => { eprintln!("replay failed: {e}"); return 1; }
    };
    if let Some(events) = initial.get("events").and_then(|v| v.as_array()) {
        for ev in events {
            if let Some(doc) = &args.doc {
                if ev.get("doc").and_then(|d| d.as_str()) != Some(doc) { continue; }
            }
            println!("{}", ev);
        }
    }
    let next_since = initial.get("nextSince").and_then(|v| v.as_str()).map(str::to_string);

    if !args.follow { return 0; }

    // 2. Subscribe to WS — convert http(s):// to ws(s)://
    let ws_url = {
        let mut u = server.clone();
        let scheme = match u.scheme() {
            "http" => "ws",
            "https" => "wss",
            other => { eprintln!("unsupported scheme: {other}"); return 1; }
        };
        u.set_scheme(scheme).expect("set_scheme to ws/wss");
        u.set_path("/ws/events");
        u
    };
    let (mut ws, _) = match tokio_tungstenite::connect_async(&ws_url).await {
        Ok(c) => c,
        Err(e) => { eprintln!("ws connect: {e}"); return 1; }
    };

    // 3. Loop: receive {type:"event", event:...} frames; print event; honor SIGINT (tokio::signal).
    let mut sigint = tokio::signal::ctrl_c();
    loop {
        tokio::select! {
            _ = &mut sigint => break,
            msg = ws.next() => match msg {
                Some(Ok(Message::Text(t))) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                        if v.get("type").and_then(|x| x.as_str()) == Some("event") {
                            if let Some(ev) = v.get("event") {
                                if let Some(doc) = &args.doc {
                                    if ev.get("doc").and_then(|d| d.as_str()) != Some(doc) { continue; }
                                }
                                println!("{ev}");
                            }
                        }
                        // "hello" frames ignored on tail
                    }
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => continue,  // ping/pong/binary — ignore
                Some(Err(e)) => { eprintln!("ws recv: {e}"); return 2; }
            }
        }
    }
    let _ = ws.close(None).await;
    let _ = next_since; // (cursor for future --resume, not in 2d)
    0
}
```

### Acceptance for Task 5

- All 3 tests in `tools_tail_smoke.rs` pass with `cargo test -- --ignored`.
- Manual: `cargo run -p domi-server --bin domi-server -- --port 4173` in one shell, `cargo run -p domi-server --bin domi -- tail` in another, click a served HTML file → tail prints the event JSON live.

## Task 6: `scripts/install.sh`

```sh
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

if [ "$NO_VERIFY" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    echo "==> Verifying install"
    "$ROOT_DIR/scripts/verify.sh" --prefix "$PREFIX" || { echo "verify failed" >&2; exit 3; }
fi

echo "==> Done."
```

### Acceptance for Task 6

- `sh -n scripts/install.sh` parses cleanly.
- `./scripts/install.sh --dry-run` prints the build/verify plan without writing files.
- `./scripts/install.sh --no-verify --prefix /tmp/domi-test` on a fresh checkout builds + installs to `/tmp/domi-test/bin/` and exits 0.
- `./scripts/install.sh` (no args) installs to `~/.local/bin/` and prints the PATH hint if not already on PATH.

## Task 7: `scripts/verify.sh` + `scripts/ws-probe.mjs`

### 7.1 `scripts/ws-probe.mjs`

Tiny Node WS client. Takes `--url <ws-url>`, connects, prints first text frame to stdout, exits 0. Used by `verify.sh`.

```js
#!/usr/bin/env node
// Minimal WebSocket probe for scripts/verify.sh.
// Usage: ws-probe.mjs --url ws://127.0.0.1:<port>/ws/events
import WebSocket from 'ws';
import { argv } from 'node:process';

const url = (() => {
    const i = argv.indexOf('--url');
    if (i < 0 || i + 1 >= argv.length) {
        console.error('usage: ws-probe.mjs --url <ws-url>');
        process.exit(2);
    }
    return argv[i + 1];
})();

const ws = new WebSocket(url);
const timer = setTimeout(() => {
    console.error('timeout waiting for first frame');
    process.exit(5);
}, 5000);

ws.on('open', () => { /* wait for server hello */ });
ws.on('message', (data) => {
    clearTimeout(timer);
    process.stdout.write(data.toString('utf8') + '\n');
    ws.close();
    process.exit(0);
});
ws.on('error', (e) => {
    clearTimeout(timer);
    console.error(e.message);
    process.exit(1);
});
```

Add `ws` to `package.json` devDeps (already likely present from 2b's `domi-wire.js` tests — verify during plan-execute).

### 7.2 `scripts/verify.sh`

```sh
#!/bin/sh
# DOMiNice install verifier — boots domi-server on ephemeral port,
# asserts /healthz, POST /api/events, GET /api/events, /ws/events upgrade.
# Usage: ./scripts/verify.sh [--prefix <dir>] [--timeout <seconds>]
set -eu

PREFIX="${HOME}/.local"
TIMEOUT=10
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

while [ $# -gt 0 ]; do
    case "$1" in
        --prefix)  PREFIX="$2"; shift 2 ;;
        --timeout) TIMEOUT="$2"; shift 2 ;;
        -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
        *) echo "unknown flag: $1" >&2; exit 1 ;;
    esac
done

SERVER_BIN="${PREFIX}/bin/domi-server"
CLI_BIN="${PREFIX}/bin/domi"
WS_PROBE="${SCRIPT_DIR}/ws-probe.mjs"

[ -x "$SERVER_BIN" ] || { echo "missing $SERVER_BIN — run install.sh first" >&2; exit 1; }
[ -x "$CLI_BIN" ]    || { echo "missing $CLI_BIN — run install.sh first"    >&2; exit 1; }
[ -f "$WS_PROBE" ]   || { echo "missing $WS_PROBE" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node not found (needed for ws-probe)" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl not found" >&2; exit 1; }
command -v jq   >/dev/null 2>&1 || { echo "jq not found"   >&2; exit 1; }

# Pick an ephemeral port — bind to 0, query the assigned port via /proc or lsof trick.
# Simpler: pick a high random port and hope nothing's there. Cross-platform enough for 2d.
PORT=$(( 20000 + (RANDOM % 10000) ))
LOG=$(mktemp -t domi-verify.XXXXXX.log)
cleanup() {
    if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
        kill -TERM "$PID" 2>/dev/null || true
        sleep 1
        kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null || true
    fi
    wait "${PID:-0}" 2>/dev/null || true
    rm -f "$LOG"
}
trap cleanup EXIT INT TERM

echo "==> Booting $SERVER_BIN on port $PORT"
"$SERVER_BIN" --port "$PORT" --root /tmp/domi-verify-root --state /tmp/domi-verify-state >"$LOG" 2>&1 &
PID=$!

# Assertion 1: /healthz
echo "==> Assert /healthz"
HEALTHZ_OK=0
i=0
while [ $i -lt "$TIMEOUT" ]; do
    if curl -fsS "http://127.0.0.1:$PORT/healthz" 2>/dev/null | jq -e '.status == "ok"' >/dev/null; then
        HEALTHZ_OK=1; break
    fi
    sleep 1
    i=$((i + 1))
done
[ "$HEALTHZ_OK" = 1 ] || { echo "healthz failed after ${TIMEOUT}s" >&2; cat "$LOG" >&2; exit 2; }
echo "    OK"

# Assertion 2: POST /api/events
echo "==> Assert POST /api/events"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "http://127.0.0.1:$PORT/api/events" \
    -H 'Content-Type: application/json' \
    -d '{"v":2,"id":null,"ts":null,"type":"click","doc":"synthetic","target":"button.ok","payload":{}}')
[ "$HTTP_CODE" = "204" ] || { echo "POST expected 204, got $HTTP_CODE" >&2; exit 3; }
echo "    OK (204)"

# Assertion 3: GET /api/events round-trip
echo "==> Assert GET /api/events"
REPLAY_JSON=$("$CLI_BIN" replay --server "http://127.0.0.1:$PORT" --doc synthetic --limit 10)
COUNT=$(echo "$REPLAY_JSON" | jq '.events | length')
[ "$COUNT" -ge 1 ] || { echo "expected >= 1 event, got $COUNT" >&2; echo "$REPLAY_JSON" >&2; exit 4; }
HAS_ID=$(echo "$REPLAY_JSON" | jq -r '.events[0].id')
case "$HAS_ID" in
    01*) echo "    OK (id=$HAS_ID)" ;;
    *)   echo "expected server-stamped ULID id, got $HAS_ID" >&2; exit 4 ;;
esac

# Assertion 4: /ws/events upgrade
echo "==> Assert /ws/events upgrade"
HELLO=$(node "$WS_PROBE" --url "ws://127.0.0.1:$PORT/ws/events" 2>/dev/null) || { echo "ws-probe failed" >&2; exit 5; }
HELLO_TYPE=$(echo "$HELLO" | jq -r '.type')
HELLO_V=$(echo "$HELLO" | jq -r '.v')
[ "$HELLO_TYPE" = "hello" ] && [ "$HELLO_V" = "2" ] || { echo "expected hello v:2, got $HELLO" >&2; exit 5; }
echo "    OK (hello v:$HELLO_V)"

# Cleanup happens via trap
echo "==> All assertions passed."
exit 0
```

### Acceptance for Task 7

- `sh -n scripts/verify.sh` parses cleanly.
- `./scripts/verify.sh --prefix /tmp/domi-test` (after install.sh) → exits 0, all four assertions print `OK`.
- `./scripts/verify.sh` against a not-running port (no install) → exits 1 (binary missing).
- `scripts/ws-probe.mjs --url ws://127.0.0.1:9/ws/events` (nothing listening) → exits 1 within 5s.

## Task 8: `tests/wire-protocol.test.js` — add 2d smoke markers

The existing `tests/wire-protocol.test.js` validates JSON shapes against `docs/schemas/event.schema.json`. Add 2 lightweight assertions:

- `tools push round-trip via CLI matches schema` — runs `domi push --json '{...}'` against a real binary (boot in test setup), GETs back via `domi replay`, asserts the round-tripped event matches the schema.
- `tools push with bogus type is rejected` — runs `domi push --type bogus`, asserts the server returns 400 and `domi` exits 2.

Both gated behind `describe.skipIf(!process.env.DOMI_TEST_LIVE)` or similar — keep default `npm test` hermetic.

### Acceptance for Task 8

- `npm test` (default) still 83/83 green.
- `DOMI_TEST_LIVE=1 npm test` runs the 2 new tests, both pass.

## Task 9: Documentation + release notes

### 9.1 `RELEASE-NOTES-v0.1.0.md`

Append a new section above the "Phase 2d" heading:

```markdown
---

## Phase 2d — Agent tooling (2026-07-05)

- New `domi` CLI binary (alongside `domi-server`) in `crates/domi-server/src/tools/`.
- Three subcommands:
  - `domi tail [--server URL] [--follow] [--limit N] [--doc NAME]` — line-delimited JSON stream of v2 events.
  - `domi replay [--server URL] [--since ULID] [--doc NAME] [--limit N]` — one-shot fetch from `GET /api/events`.
  - `domi push --type TYPE [--doc NAME] [--target SEL] [--json RAW] --server URL` — POST a synthetic v2 event.
- Wire protocol: same JSON shapes as `domi.js` server mode (2b) and the binary (2c-γ). ULID cursor semantics from 2a.
- New `scripts/install.sh` — builds and installs `domi-server` + `domi` to `${PREFIX:-~/.local}/bin/`.
- New `scripts/verify.sh` — boots the installed binary on an ephemeral port, asserts `/healthz`, `POST /api/events`, `GET /api/events`, `/ws/events` upgrade + hello frame.
- New `scripts/ws-probe.mjs` — Node helper for `verify.sh` WS upgrade probe.
- New tests in `crates/domi-server/tests/tools_{push,replay,tail}_smoke.rs` (3 subcommands × 3-4 assertions each, gated `#[ignore]`).
- 2 new JS tests in `tests/wire-protocol.test.js` (gated on `DOMI_TEST_LIVE=1`).
- Spec: `docs/superpowers/specs/2026-07-05-phase2d-agent-tooling-design.md`.
- Plan: `docs/superpowers/plans/2026-07-05-phase2d-agent-tooling-plan.md` (this file).
- Companion doc updates: `docs/PHASE2-SCOPE.md` (mark 2d Done), `docs/WIRE-PROTOCOL.md` (link the CLI usage section), `docs/RUST.md` (note `domi` second-binary).
- `--port 0` accepted by `domi-server` (was `1..`, now `0..=65535`) so `verify.sh` can request ephemeral ports.
- Library files (`tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`): untouched.
```

### 9.2 `docs/PHASE2-SCOPE.md`

Update the table row for **2d**:

```
| **2d** | Agent reader + install/verify | **Done** | Tail/replay/push CLI in `crates/domi-server/src/tools/`, `scripts/install.sh` + `scripts/verify.sh` + `scripts/ws-probe.mjs` exercising 2c-γ |
```

Update the dependency-order section to remove 2d from "Not started" and add a "Done" note.

### 9.3 `docs/WIRE-PROTOCOL.md`

Add a "CLI usage" subsection under the existing "Server routes" section, pointing at `domi tail`/`replay`/`push` with one example each.

### 9.4 `docs/RUST.md`

Note the new second-binary target:

```markdown
## Binaries

`crates/domi-server` ships two binaries:

- `domi-server` — the live feedback server (2c-γ).
- `domi` — agent-side CLI for tailing, replaying, and pushing events (2d).
```

### Acceptance for Task 9

- All four docs updated.
- `docs/PHASE2-SCOPE.md` reflects 2d as Done.
- `RELEASE-NOTES-v0.1.0.md` has the new section.

## Done when

- `cargo build --workspace` produces both `target/release/domi-server` and `target/release/domi` from a clean checkout.
- `cargo test --workspace` is green by default (no `--ignored`); the 11 new gated tests pass with `cargo test --workspace -- --ignored`.
- `npm test` is 85/85 green by default; `DOMI_TEST_LIVE=1 npm test` is 87/87 green.
- `./scripts/install.sh --prefix /tmp/domi-test` on a fresh clone: builds, installs to `/tmp/domi-test/bin/`, runs `verify.sh`, exits 0.
- `./scripts/install.sh --prefix /tmp/domi-test && /tmp/domi-test/bin/domi-server --port 4173 &` then in another shell: `/tmp/domi-test/bin/domi tail --server http://127.0.0.1:4173` prints line-delimited JSON events as `domi.js` clients click.
- `docs/PHASE2-SCOPE.md` lists 2d as **Done**.
- `RELEASE-NOTES-v0.1.0.md` has the Phase 2d section.
- Library invariant held: `tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/` are all untouched in the 2d diff.
- AGENTS.md conventions honored: `rtk` used for fs/git/grep; `npm test` + `cargo test --workspace` both stay green at every commit.

## Phase 2d — Agent tooling (2026-07-05)

(Final-form release-notes entry; the snippet in Task 9.1 is the canonical version.)
